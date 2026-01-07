import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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

export default function OnboardingPage() {
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(true);

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
        if (mounted) setMsg(`인증 정보 확인 실패: ${authErr.message}`);
        if (mounted) setLoading(false);
        return;
      }

      const user = authRes.user;
      if (!user) {
        if (mounted) setMsg("세션이 없습니다. 다시 로그인 해주세요.");
        if (mounted) setLoading(false);
        return;
      }

      // 이메일 미인증이면 안내(필요하면 저장 버튼 막아도 됨)
      if (!user.email_confirmed_at) {
        if (mounted) setMsg("이메일 인증이 아직 완료되지 않았습니다. 받은 편지함에서 인증 후 다시 로그인해주세요.");
      }

      // profiles 로드
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,phone,full_name,car_model,default_problem,insurance")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (error) {
        if (mounted) setMsg(`프로필 불러오기 실패: ${error.message}`);
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
      setMsg("세션이 없습니다. 다시 로그인 해주세요.");
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
      setMsg(`저장 실패: ${error.message}`);
      return;
    }

    setMsg("저장 완료 ✅");
  };

  if (loading) return <div>로딩중...</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>프로필 입력/수정</h2>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div>실명</div>
          <input {...register("full_name")} placeholder="홍길동" />
          {errors.full_name ? <small style={{ color: "crimson" }}>{errors.full_name.message}</small> : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>휴대폰 번호</div>
          <input {...register("phone")} placeholder="010-1234-5678" />
          {errors.phone ? <small style={{ color: "crimson" }}>{errors.phone.message}</small> : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>차종</div>
          <input {...register("car_model")} placeholder="예: K5, 그랜저, 카마로SS" />
          {errors.car_model ? <small style={{ color: "crimson" }}>{errors.car_model.message}</small> : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>문제(증상)</div>
          <textarea {...register("problem")} rows={4} placeholder="예: 엔진 경고등 점등, 변속 충격..." />
          {errors.problem ? <small style={{ color: "crimson" }}>{errors.problem.message}</small> : null}
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" {...register("insurance")} />
          <div>보험처리</div>
        </label>

        <button type="submit" disabled={isSubmitting}>
          저장
        </button>

        {msg ? <div style={{ marginTop: 8 }}>{msg}</div> : null}
      </form>
    </div>
  );
}
