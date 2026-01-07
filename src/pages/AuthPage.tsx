// src/pages/AuthPage.tsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import "../styles/authPremium.css";

const schema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(8, "비밀번호는 8자 이상을 권장합니다."),
});

type FormValues = z.infer<typeof schema>;

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string>("");
  const [msgTone, setMsgTone] = useState<"info" | "ok" | "err">("info");
  const navigate = useNavigate();

  const title = useMemo(() => (mode === "login" ? "로그인" : "회원가입"), [mode]);
  const subtitle = useMemo(
    () => (mode === "login" ? "관리/예약을 한 번에. 바로 들어가볼까요." : "30초 컷. 이메일과 비밀번호만 있으면 됩니다."),
    [mode]
  );

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
    setMsgTone("info");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: v.email,
        password: v.password,
      });

      if (error) {
        setMsgTone("err");
        setMsg(`회원가입 실패: ${error.message}`);
        return;
      }

      // 이메일 인증 ON이면 session이 없을 수 있음(정상)
      if (!data.session) {
        setMsgTone("info");
        setMsg("회원가입 완료 ✅ 이메일 인증 후 로그인해주세요.");
        return;
      }

      setMsgTone("ok");
      setMsg("회원가입 + 로그인 완료 ✅");
      navigate("/onboarding");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: v.email,
      password: v.password,
    });

    if (error) {
      setMsgTone("err");
      setMsg(`로그인 실패: ${error.message}`);
      return;
    }

    // getSession() 호출하지 말고 반환 session만 사용
    if (!data.session) {
      setMsgTone("info");
      setMsg("로그인 성공했지만 세션이 없습니다. (이메일 인증 필요/설정 확인)");
      return;
    }

    navigate("/onboarding");
  };

  return (
    <div className="authShell">
      <div className="authBg" aria-hidden />

      <div className="authCard">
        <div className="authBrand">
          <div className="authLogo" aria-hidden>
            🛠️
          </div>
          <div className="authBrandText">
            <div className="authAppName">정비 플랫폼</div>
            <div className="authAppTag">예약·운영·정산을 한 화면에</div>
          </div>
        </div>

        <div className="authHead">
          <h2 className="authTitle">{title}</h2>
          <div className="authSub">{subtitle}</div>
        </div>

        <div className="authTabs" role="tablist" aria-label="인증 모드">
          <button
            type="button"
            className={cx("authTab", mode === "login" && "isActive")}
            onClick={() => setMode("login")}
            disabled={isSubmitting}
            role="tab"
            aria-selected={mode === "login"}
          >
            로그인
          </button>
          <button
            type="button"
            className={cx("authTab", mode === "signup" && "isActive")}
            onClick={() => setMode("signup")}
            disabled={isSubmitting}
            role="tab"
            aria-selected={mode === "signup"}
          >
            회원가입
          </button>
        </div>

        <form className="authForm" onSubmit={handleSubmit(onSubmit)}>
          <label className="authField">
            <div className="authLabel">이메일</div>
            <div className={cx("authInputWrap", errors.email && "hasError")}>
              <span className="authIcon" aria-hidden>
                @
              </span>
              <input className="authInput" placeholder="you@example.com" autoComplete="email" {...register("email")} />
            </div>
            {errors.email ? <div className="authErr">{errors.email.message}</div> : null}
          </label>

          <label className="authField">
            <div className="authLabel">비밀번호</div>
            <div className={cx("authInputWrap", errors.password && "hasError")}>
              <span className="authIcon" aria-hidden>
                ••
              </span>
              <input
                className="authInput"
                type="password"
                placeholder="8자 이상"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                {...register("password")}
              />
            </div>
            {errors.password ? <div className="authErr">{errors.password.message}</div> : null}
          </label>

          <button className="authSubmit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "처리중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>

          <div className="authFinePrint">
            {mode === "signup" ? (
              <>
                가입하면 <b>이용약관</b> 및 <b>개인정보 처리방침</b>에 동의한 것으로 간주합니다.
              </>
            ) : (
              <>비밀번호를 잊었나요? (추가 시 “비밀번호 재설정” 버튼을 붙여줄게요)</>
            )}
          </div>

          {msg ? <div className={cx("authMsg", msgTone === "ok" && "isOk", msgTone === "err" && "isErr")}>{msg}</div> : null}
        </form>
      </div>
    </div>
  );
}
