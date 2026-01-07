import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

const schema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(8, "비밀번호는 8자 이상을 권장합니다."),
});

type FormValues = z.infer<typeof schema>;

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string>("");
  const navigate = useNavigate();

  const title = useMemo(() => (mode === "login" ? "로그인" : "회원가입"), [mode]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (v: FormValues) => {
    setMsg("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: v.email,
        password: v.password,
      });

      if (error) {
        setMsg(`회원가입 실패: ${error.message}`);
        return;
      }

      // 이메일 인증 ON이면 session이 없을 수 있음(정상)
      if (!data.session) {
        setMsg("회원가입 완료. 이메일 인증 후 로그인해주세요.");
        return;
      }

      setMsg("회원가입 + 로그인 완료 ✅");
      navigate("/onboarding");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: v.email,
      password: v.password,
    });

    if (error) {
      setMsg(`로그인 실패: ${error.message}`);
      return;
    }

    // getSession() 호출하지 말고 반환 session만 사용
    if (!data.session) {
      setMsg("로그인 성공했지만 세션이 없습니다. (이메일 인증 필요/설정 확인)");
      return;
    }

    navigate("/onboarding");
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button disabled={mode === "login"} onClick={() => setMode("login")}>
          로그인
        </button>
        <button disabled={mode === "signup"} onClick={() => setMode("signup")}>
          회원가입
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div>이메일</div>
          <input placeholder="you@example.com" {...register("email")} />
          {errors.email ? <small style={{ color: "crimson" }}>{errors.email.message}</small> : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div>비밀번호</div>
          <input type="password" placeholder="8자 이상" {...register("password")} />
          {errors.password ? <small style={{ color: "crimson" }}>{errors.password.message}</small> : null}
        </label>

        <button type="submit" disabled={isSubmitting}>
          {mode === "login" ? "로그인" : "회원가입"}
        </button>

        {msg ? <div style={{ marginTop: 8 }}>{msg}</div> : null}
      </form>
    </div>
  );
}
