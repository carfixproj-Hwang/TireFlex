import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import "../styles/premiumForms.css";

const phoneRegex = /^01[0-9]-\d{3,4}-\d{4}$/;

const schema = z.object({
  full_name: z.string().min(2, "실명은 2자 이상 입력해주세요."),
  phone: z.string().regex(phoneRegex, "휴대폰 번호 형식: 010-0000-0000"),
  car_model: z.string().min(1, "차종을 입력해주세요. (예: K5, 아반떼, 카마로SS 등)"),
  problem: z.string().min(1, "문제(증상)를 입력해주세요."),
  insurance: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

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
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      phone: "010-",
      car_model: "",
      problem: "",
      insurance: false,
    },
  });

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
        if (mounted) {
          setMsg("이메일 인증이 아직 완료되지 않았습니다. 받은 편지함에서 인증 후 다시 로그인해주세요.");
        }
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
        setValue("full_name", data.full_name ?? "");
        setValue("phone", data.phone ?? "010-");
        setValue("car_model", data.car_model ?? "");
        setValue("problem", data.default_problem ?? "");
        setValue("insurance", Boolean(data.insurance));
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

    const payload = {
      id: user.id,
      email: user.email ?? null,
      full_name: v.full_name,
      phone: v.phone,
      car_model: v.car_model,
      default_problem: v.problem,
      insurance: v.insurance,
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

    if (error) {
      showToast({ kind: "err", title: "저장 실패", body: error.message });
      return;
    }

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
            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">실명</div>
              <input className={`pInput ${errClass(!!errors.full_name)}`} {...register("full_name")} placeholder="홍길동" />
              {errors.full_name ? <div className="pErr">{errors.full_name.message}</div> : null}
            </div>

            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">휴대폰 번호</div>
              <input className={`pInput ${errClass(!!errors.phone)}`} {...register("phone")} placeholder="010-1234-5678" />
              {errors.phone ? <div className="pErr">{errors.phone.message}</div> : null}
            </div>

            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">차종</div>
              <input className={`pInput ${errClass(!!errors.car_model)}`} {...register("car_model")} placeholder="예: K5, 그랜저, 카마로SS" />
              {errors.car_model ? <div className="pErr">{errors.car_model.message}</div> : null}
            </div>

            <div className="pField" style={{ minWidth: "auto" }}>
              <div className="pLabel">문제(증상)</div>
              <textarea className={`pText ${errClass(!!errors.problem)}`} {...register("problem")} rows={4} placeholder="예: 엔진 경고등 점등, 변속 충격..." />
              {errors.problem ? <div className="pErr">{errors.problem.message}</div> : null}
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
