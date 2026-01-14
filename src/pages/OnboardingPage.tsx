// src/pages/OnboardingPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form"; // ✅ 여기 오타 수정: react-hookform ❌ -> react-hook-form ✅
import { zodResolver } from "@hookform/resolvers/zod";

import "../styles/premiumForms.css";

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D+/g, "");
}

function formatPhoneKR(digits: string) {
  const d = onlyDigits(digits).slice(0, 11);

  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;

  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(d.length - 4)}`;
}

function sanitizeName(v: string) {
  // 한글/영문/공백만 허용, 공백 1칸으로 정리, 앞뒤 공백 제거
  const kept = (v ?? "").replace(/[^A-Za-z가-힣 ]+/g, "");
  return kept.replace(/\s+/g, " ").trim();
}

function sanitizeDigits(v: string) {
  return onlyDigits(v).slice(0, 11);
}

const nameRegex = /^[A-Za-z가-힣]+(?: [A-Za-z가-힣]+)*$/;
const phoneDigitsRegex = /^01\d{8,9}$/;

const schema = z.object({
  full_name: z.preprocess(
    (v) => sanitizeName(String(v ?? "")),
    z
      .string()
      .min(2, "실명은 2자 이상 입력해주세요.")
      .regex(nameRegex, "이름은 한글 또는 영어만 가능합니다. (특수문자/숫자 불가)")
  ),

  phone: z.preprocess(
    (v) => sanitizeDigits(String(v ?? "")),
    z.string().regex(phoneDigitsRegex, "휴대폰 번호는 숫자만 입력하세요. (예: 01012345678)")
  ),

  car_model: z.string().min(1, "차종을 입력해주세요. (예: K5, 아반떼, 카마로SS 등)"),
  problem: z.string().min(1, "문제(증상)를 입력해주세요."),
  insurance: z.boolean(),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

type ProfileRow = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  car_model: string | null;
  default_problem: string | null;
  insurance: boolean | null;
};

type ToastState = { kind: "ok" | "err"; title: string; body?: string } | null;

function Toast({ t, closing }: { t: ToastState; closing: boolean }) {
  if (!t) return null;
  return (
    <div className="pToastWrap" aria-live="polite" aria-atomic="true">
      <div className={closing ? "pToast pToastOut" : "pToast"}>
        <span className={t.kind === "err" ? "pToastDot err" : "pToastDot"} />
        <div>
          <div className="pToastTitle">{t.title}</div>
          {t.body ? <div className="pToastBody">{t.body}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<ToastState>(null);
  const [toastClosing, setToastClosing] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  // ✅ IME(한글 입력) 조합중 여부
  const [nameComposing, setNameComposing] = useState(false);

  const showToast = (t: ToastState) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastClosing(false);
    setToast(t);

    toastTimerRef.current = window.setTimeout(() => {
      setToastClosing(true);
      window.setTimeout(() => setToast(null), 170);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, any, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      phone: "010",
      car_model: "",
      problem: "",
      insurance: false,
    },
  });

  const phoneRaw = watch("phone");
  const phoneDigits = typeof phoneRaw === "string" ? phoneRaw : String(phoneRaw ?? "");
  const phonePretty = useMemo(() => formatPhoneKR(phoneDigits), [phoneDigits]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setMsg("");

      const { data: authRes, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        if (mounted) showToast({ kind: "err", title: "인증 정보 확인 실패", body: authErr.message });
        if (mounted) setLoading(false);
        return;
      }

      const user = authRes.user;
      if (!user) {
        if (mounted) showToast({ kind: "err", title: "세션 없음", body: "다시 로그인 해주세요." });
        if (mounted) setLoading(false);
        return;
      }

      if (!user.email_confirmed_at) {
        if (mounted) setMsg("이메일 인증이 아직 완료되지 않았습니다. 받은 편지함에서 인증 후 다시 로그인해주세요.");
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,phone,full_name,car_model,default_problem,insurance")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (error) {
        if (mounted) showToast({ kind: "err", title: "프로필 불러오기 실패", body: error.message });
        if (mounted) setLoading(false);
        return;
      }

      if (data) {
        setValue("full_name", sanitizeName(data.full_name ?? ""), { shouldValidate: false });
        setValue("phone", sanitizeDigits(data.phone ?? "010"), { shouldValidate: false });
        setValue("car_model", data.car_model ?? "", { shouldValidate: false });
        setValue("problem", data.default_problem ?? "", { shouldValidate: false });
        setValue("insurance", Boolean(data.insurance), { shouldValidate: false });
      }

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [setValue]);

  const onSubmit = async (v: FormValues) => {
    setMsg("");

    const { data: authRes } = await supabase.auth.getUser();
    const user = authRes.user;

    if (!user) {
      showToast({ kind: "err", title: "세션 없음", body: "다시 로그인 해주세요." });
      return;
    }

    const safeName = sanitizeName(v.full_name);
    const safePhoneDigits = sanitizeDigits(v.phone);
    const safePhoneFormatted = formatPhoneKR(safePhoneDigits);

    const payload = {
      id: user.id,
      email: user.email ?? null,
      full_name: safeName,
      phone: safePhoneFormatted,
      car_model: (v.car_model ?? "").trim(),
      default_problem: (v.problem ?? "").trim(),
      insurance: Boolean(v.insurance),
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

    if (error) {
      showToast({ kind: "err", title: "저장 실패", body: error.message });
      return;
    }

    setValue("full_name", safeName, { shouldValidate: true });
    setValue("phone", safePhoneDigits, { shouldValidate: true });

    showToast({ kind: "ok", title: "저장 완료", body: "프로필이 업데이트 되었습니다." });
  };

  if (loading) {
    return (
      <div className="pPage">
        <div className="pContainer">
          <div className="pCard">
            <div className="pCardTitle">로딩중…</div>
            <div className="pMini">프로필 정보를 불러오고 있어요.</div>
          </div>
        </div>
      </div>
    );
  }

  const errClass = (hasErr: boolean) => (hasErr ? "err" : "");

  return (
    <div className="pPage">
      <Toast t={toast} closing={toastClosing} />

      <div className="pContainer">
        <div className="pTitleRow">
          <div>
            <h2 className="pTitle">프로필</h2>
            <p className="pSub">예약을 빠르게 처리하기 위해 기본 정보를 저장합니다.</p>
          </div>
          <div className="pHint">기본 정보는 언제든 수정 가능</div>
        </div>

        <div className="pCard">
          <div className="pCardTitle">입력/수정</div>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 12 }}>
            {/* ✅ 실명: IME 조합중에는 sanitize 하지 않고, 조합 종료/블러 때만 sanitize */}
            <Controller
              name="full_name"
              control={control}
              render={({ field }) => {
                const v = typeof field.value === "string" ? field.value : String(field.value ?? "");
                return (
                  <div className="pField" style={{ minWidth: "auto" }}>
                    <div className="pLabel">실명</div>
                    <input
                      className={`pInput ${errClass(!!errors.full_name)}`}
                      value={v}
                      onCompositionStart={() => setNameComposing(true)}
                      onCompositionEnd={(e) => {
                        setNameComposing(false);
                        const cleaned = sanitizeName(e.currentTarget.value);
                        field.onChange(cleaned);
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        field.onChange(nameComposing ? raw : sanitizeName(raw));
                      }}
                      onBlur={(e) => {
                        const cleaned = sanitizeName(e.currentTarget.value);
                        field.onChange(cleaned);
                        field.onBlur();
                      }}
                      placeholder="홍길동 / John Doe"
                      inputMode="text"
                      autoComplete="name"
                    />
                    {errors.full_name ? <div className="pErr">{String(errors.full_name.message ?? "")}</div> : null}
                    {!errors.full_name ? <div className="pMini">* 한글/영어만 가능 (특수문자/숫자 불가)</div> : null}
                  </div>
                );
              }}
            />

            {/* 번호: 숫자만 입력, 표시는 자동 하이픈 */}
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <div className="pField" style={{ minWidth: "auto" }}>
                  <div className="pLabel">휴대폰 번호</div>
                  <input
                    className={`pInput ${errClass(!!errors.phone)}`}
                    value={phonePretty}
                    onChange={(e) => field.onChange(sanitizeDigits(e.target.value))}
                    onBlur={(e) => field.onChange(sanitizeDigits(e.currentTarget.value))}
                    placeholder="01012345678"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                  {errors.phone ? <div className="pErr">{String(errors.phone.message ?? "")}</div> : null}
                  {!errors.phone ? <div className="pMini">* 숫자만 입력. 저장 시 010-0000-0000 형식</div> : null}
                </div>
              )}
            />

            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">차종</div>
              <input className={`pInput ${errClass(!!errors.car_model)}`} {...register("car_model")} placeholder="예: K5, 그랜저, 카마로SS" />
              {errors.car_model ? <div className="pErr">{String(errors.car_model.message ?? "")}</div> : null}
            </div>

            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">문제(증상)</div>
              <textarea className={`pText ${errClass(!!errors.problem)}`} {...register("problem")} rows={4} placeholder="예: 엔진 경고등 점등, 변속 충격..." />
              {errors.problem ? <div className="pErr">{String(errors.problem.message ?? "")}</div> : null}
            </div>

            <label className="pCheckRow">
              <input type="checkbox" {...register("insurance")} />
              <div>보험처리</div>
            </label>

            <button className="pBtnPrimary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "저장중…" : "저장"}
            </button>

            {msg ? <div className="pMsg">{msg}</div> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
