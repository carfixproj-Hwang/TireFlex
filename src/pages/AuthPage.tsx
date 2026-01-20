// src/pages/AuthPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Mode = "login" | "signup" | "verify" | "reset";
type ResetStep = "request" | "verify" | "set";

function trim(v: string) {
  return (v ?? "").trim();
}
function stripWhitespace(v: string) {
  return String(v ?? "").replace(/\s+/g, "");
}
function hasWhitespace(v: string) {
  return /\s/.test(String(v ?? ""));
}

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const mountedRef = useRef(true);

  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [otp, setOtp] = useState("");

  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const suppressRedirectRef = useRef(false);

  const origin = useMemo(() => window.location.origin, []);
  const emailTrimmed = useMemo(() => trim(email).toLowerCase(), [email]);

  const qs = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const isResetRoute = useMemo(() => qs.get("mode") === "reset", [qs]);
  const stepFromQs = useMemo(() => {
    const s = qs.get("step");
    return s === "request" || s === "verify" || s === "set" ? (s as ResetStep) : null;
  }, [qs]);

  const styles = useMemo(() => {
    const bg: React.CSSProperties = {
      position: "fixed",
      inset: 0,
      zIndex: -1,
      background:
        "radial-gradient(900px 420px at 18% 8%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(800px 420px at 82% 12%, rgba(255,255,255,0.07), transparent 62%), linear-gradient(180deg, #0b1220, #070b14)",
    };

    const shell: React.CSSProperties = { maxWidth: 520, margin: "0 auto", padding: 12 };

    const card: React.CSSProperties = {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 18,
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      overflow: "hidden",
    };

    const head: React.CSSProperties = {
      padding: 14,
      borderBottom: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
      color: "rgba(255,255,255,0.94)",
      fontWeight: 950,
      letterSpacing: "-0.6px",
    };

    const body: React.CSSProperties = { padding: 14, display: "grid", gap: 12 };

    const segWrap: React.CSSProperties = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 8,
    };

    const segBtnBase: React.CSSProperties = {
      padding: "10px 10px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.90)",
      fontWeight: 950,
      cursor: "pointer",
      boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
      whiteSpace: "nowrap",
    };

    const segBtnActive: React.CSSProperties = {
      ...segBtnBase,
      background: "rgba(255,255,255,0.92)",
      color: "#0b0f18",
      border: "1px solid rgba(255,255,255,0.32)",
    };

    const label: React.CSSProperties = {
      fontSize: 12,
      opacity: 0.78,
      color: "rgba(255,255,255,0.90)",
      marginBottom: 6,
    };

    const input: React.CSSProperties = {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
    };

    const hint: React.CSSProperties = { fontSize: 12, opacity: 0.72, color: "rgba(255,255,255,0.84)" };

    const msgBar: React.CSSProperties = {
      padding: 10,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
    };

    const msgDanger: React.CSSProperties = {
      ...msgBar,
      border: "1px solid rgba(251,113,133,0.35)",
      background: "rgba(251,113,133,0.12)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 900,
    };

    const btn: React.CSSProperties = {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 900,
      cursor: "pointer",
    };

    const btnPrimary: React.CSSProperties = {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.92)",
      color: "#0b0f18",
      fontWeight: 950,
      cursor: "pointer",
      boxShadow: "0 16px 34px rgba(0,0,0,0.35)",
    };

    const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

    const chip: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 950,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      whiteSpace: "nowrap",
    };

    return {
      bg,
      shell,
      card,
      head,
      body,
      segWrap,
      segBtnBase,
      segBtnActive,
      label,
      input,
      hint,
      msgBar,
      msgDanger,
      btn,
      btnPrimary,
      row,
      chip,
    };
  }, []);

  const onPwChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = stripWhitespace(raw);
    setter(cleaned);
  };

  const onPwPaste = (setter: (v: string) => void) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const cleaned = stripWhitespace(text);
    setter(cleaned);
  };

  const blockSpaceKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") e.preventDefault();
  };

  function switchMode(next: Mode) {
    setMode(next);
    setMsg(null);
    setPassword("");
    setOtp("");
    setNewPw("");
    setNewPw2("");

    if (next === "reset") {
      suppressRedirectRef.current = true;
      setResetStep("request");
      nav("/auth?mode=reset&step=request", { replace: true });
    } else {
      suppressRedirectRef.current = false;
    }
  }

  // URL이 reset이면 상태를 reset으로 고정
  useEffect(() => {
    mountedRef.current = true;

    if (isResetRoute) {
      suppressRedirectRef.current = true;
      setMode("reset");
      setResetStep(stepFromQs ?? "request");
    }

    // 이미 세션이 있어도 reset 플로우면 홈 이동 금지
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mountedRef.current) return;
      if (data.session && !(isResetRoute || mode === "reset" || suppressRedirectRef.current)) {
        nav("/", { replace: true });
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      // ✅ reset 라우트면 SIGNED_IN 되어도 절대 홈으로 보내지 않음
      if (isResetRoute || mode === "reset" || suppressRedirectRef.current) return;

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && session) {
        nav("/", { replace: true });
      }
    });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [nav, isResetRoute, stepFromQs, mode]);

  async function doLogin() {
    const e = emailTrimmed;
    const p = password;

    if (!e) return setMsg("이메일을 입력하세요.");
    if (!p) return setMsg("비밀번호를 입력하세요.");
    if (hasWhitespace(p)) return setMsg("비밀번호에는 공백을 사용할 수 없습니다.");

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
      if (error) {
        if (/email.*not.*confirmed/i.test(error.message)) {
          setMode("verify");
          setMsg("이메일 인증이 필요합니다. 메일로 받은 인증코드(Token)를 입력하세요.");
        } else {
          setMsg(error.message);
        }
        return;
      }

      suppressRedirectRef.current = false;
      nav("/", { replace: true });
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function doSignup() {
    const e = emailTrimmed;
    const p = password;

    if (!e) return setMsg("이메일을 입력하세요.");
    if (!p || p.length < 6) return setMsg("비밀번호는 6자 이상으로 입력하세요.");
    if (hasWhitespace(p)) return setMsg("비밀번호에는 공백을 사용할 수 없습니다.");

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.signUp({
        email: e,
        password: p,
        options: { emailRedirectTo: `${origin}/auth` },
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMode("verify");
      setMsg("인증 메일을 보냈어요. 메일의 인증코드(Token)를 입력하세요.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function doVerifyEmail() {
    const e = emailTrimmed;
    const code = trim(otp);

    if (!e) return setMsg("이메일을 입력하세요.");
    if (!code) return setMsg("인증코드(Token)를 입력하세요.");

    setLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "email",
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      if (data?.session) {
        suppressRedirectRef.current = false;
        nav("/", { replace: true });
        return;
      }

      setMsg("인증 완료. 잠시 후 자동으로 이동합니다.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function resendSignupOtp() {
    const e = emailTrimmed;
    if (!e) return setMsg("이메일을 입력하세요.");

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: e,
        options: { emailRedirectTo: `${origin}/auth` },
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("인증코드를 다시 보냈어요. 메일함을 확인하세요.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // ======================
  // Password reset (Token)
  // ======================
  async function doResetRequest() {
    const e = emailTrimmed;
    if (!e) return setMsg("이메일을 입력하세요.");

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(e, {
        redirectTo: `${origin}/auth?mode=reset&step=set`,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      suppressRedirectRef.current = true;
      setMode("reset");
      setResetStep("verify");
      nav("/auth?mode=reset&step=verify", { replace: true });
      setMsg("비밀번호 재설정 코드를 보냈어요. 메일의 Token을 입력하세요.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function doResetVerify() {
    const e = emailTrimmed;
    const code = trim(otp);

    if (!e) return setMsg("이메일을 입력하세요.");
    if (!code) return setMsg("재설정 코드(Token)를 입력하세요.");

    setLoading(true);
    setMsg(null);

    try {
      // recovery 토큰 검증 → 세션 생성(SIGNED_IN) 가능
      const { error } = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "recovery",
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // ✅ SIGNED_IN 되어도 reset 페이지 유지
      suppressRedirectRef.current = true;
      setMode("reset");
      setResetStep("set");
      nav("/auth?mode=reset&step=set", { replace: true });
      setMsg("코드 확인 완료. 새 비밀번호를 설정하세요.");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function doResetSet() {
    const p1 = newPw;
    const p2 = newPw2;

    if (!p1 || p1.length < 6) return setMsg("새 비밀번호는 6자 이상으로 입력하세요.");
    if (hasWhitespace(p1) || hasWhitespace(p2)) return setMsg("비밀번호에는 공백을 사용할 수 없습니다.");
    if (p1 !== p2) return setMsg("새 비밀번호가 서로 다릅니다.");

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) {
        setMsg(error.message);
        return;
      }

      suppressRedirectRef.current = false;
      setMsg("비밀번호 변경 완료. 홈으로 이동합니다.");
      nav("/", { replace: true });
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  const actionLabel =
    loading
      ? "처리중..."
      : mode === "login"
        ? "로그인"
        : mode === "signup"
          ? "회원가입"
          : mode === "verify"
            ? "인증 완료"
            : resetStep === "request"
              ? "코드 전송"
              : resetStep === "verify"
                ? "코드 확인"
                : "비밀번호 변경";

  async function onPrimary() {
    if (mode === "login") return doLogin();
    if (mode === "signup") return doSignup();
    if (mode === "verify") return doVerifyEmail();
    if (resetStep === "request") return doResetRequest();
    if (resetStep === "verify") return doResetVerify();
    return doResetSet();
  }

  const showPassword = mode === "login" || mode === "signup";
  const showEmailOtp = mode === "verify";
  const showReset = mode === "reset";

  return (
    <div style={styles.shell}>
      <div style={styles.bg} aria-hidden />

      <div style={styles.card}>
        <div style={styles.head}>계정</div>

        <div style={styles.body}>
          <div style={styles.segWrap}>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode("login")}
              style={mode === "login" ? styles.segBtnActive : styles.segBtnBase}
            >
              로그인
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode("signup")}
              style={mode === "signup" ? styles.segBtnActive : styles.segBtnBase}
            >
              회원가입
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode("verify")}
              style={mode === "verify" ? styles.segBtnActive : styles.segBtnBase}
              title="메일 인증코드(Token)"
            >
              이메일 인증
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchMode("reset")}
              style={mode === "reset" ? styles.segBtnActive : styles.segBtnBase}
              title="Token으로 비밀번호 재설정"
            >
              비번 재설정
            </button>
          </div>

          <div>
            <div style={styles.label}>이메일</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              style={styles.input}
            />
            {showReset ? (
              <div style={{ ...styles.hint, marginTop: 8 }}>
                {resetStep === "request"
                  ? "메일로 재설정 코드를 보냅니다."
                  : resetStep === "verify"
                    ? "메일에 온 Token을 입력해 주세요."
                    : "새 비밀번호를 설정하세요."}
              </div>
            ) : null}
          </div>

          {showPassword ? (
            <div>
              <div style={styles.label}>비밀번호</div>
              <input
                value={password}
                onChange={onPwChange(setPassword)}
                onPaste={onPwPaste(setPassword)}
                onKeyDown={(e) => {
                  blockSpaceKey(e);
                  if (e.key === "Enter") (mode === "login" ? doLogin : doSignup)();
                }}
                placeholder="••••••••"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                style={styles.input}
              />
              <div style={{ ...styles.hint, marginTop: 8 }}>* 비밀번호에는 공백을 사용할 수 없습니다.</div>
            </div>
          ) : null}

          {showEmailOtp ? (
            <div>
              <div style={styles.label}>인증코드(Token)</div>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="메일로 받은 Token 입력"
                inputMode="numeric"
                style={{ ...styles.input, letterSpacing: "0.6px" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doVerifyEmail();
                }}
              />

              <div style={{ ...styles.row, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={resendSignupOtp}
                  disabled={loading}
                  style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
                >
                  코드 재전송
                </button>
                <span style={styles.chip}>메일 템플릿에 Token 출력이 필요해요</span>
              </div>
            </div>
          ) : null}

          {showReset ? (
            <div style={{ display: "grid", gap: 10 }}>
              {resetStep === "verify" ? (
                <div>
                  <div style={styles.label}>재설정 코드(Token)</div>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="메일로 받은 Token 입력"
                    inputMode="numeric"
                    style={{ ...styles.input, letterSpacing: "0.6px" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doResetVerify();
                    }}
                  />
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={doResetRequest}
                      disabled={loading}
                      style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
                    >
                      코드 재전송
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetStep("request");
                        nav("/auth?mode=reset&step=request", { replace: true });
                        setOtp("");
                        setMsg(null);
                      }}
                      disabled={loading}
                      style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
                    >
                      뒤로
                    </button>
                  </div>
                </div>
              ) : null}

              {resetStep === "set" ? (
                <>
                  <div>
                    <div style={styles.label}>새 비밀번호</div>
                    <input
                      value={newPw}
                      onChange={onPwChange(setNewPw)}
                      onPaste={onPwPaste(setNewPw)}
                      onKeyDown={blockSpaceKey}
                      placeholder="6자 이상"
                      type="password"
                      autoComplete="new-password"
                      style={styles.input}
                    />
                    <div style={{ ...styles.hint, marginTop: 8 }}>* 비밀번호에는 공백을 사용할 수 없습니다.</div>
                  </div>
                  <div>
                    <div style={styles.label}>새 비밀번호 확인</div>
                    <input
                      value={newPw2}
                      onChange={onPwChange(setNewPw2)}
                      onPaste={onPwPaste(setNewPw2)}
                      onKeyDown={(e) => {
                        blockSpaceKey(e);
                        if (e.key === "Enter") doResetSet();
                      }}
                      placeholder="한 번 더 입력"
                      type="password"
                      autoComplete="new-password"
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.hint}>
                    * Token 검증 후 세션이 생성되어야 비밀번호 변경이 가능합니다.
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {msg ? <div style={styles.msgDanger}>{msg}</div> : null}

          <button
            type="button"
            onClick={onPrimary}
            disabled={loading}
            style={{ ...styles.btnPrimary, opacity: loading ? 0.75 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {actionLabel}
          </button>

          {mode !== "reset" ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => switchMode("reset")}
                disabled={loading}
                style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
              >
                비밀번호를 잊었어요
              </button>

              <div style={styles.hint}>
                {mode === "signup"
                  ? "가입 후 메일 Token으로 인증이 필요합니다."
                  : mode === "verify"
                    ? "메일함에서 Token을 확인하세요."
                    : "계정은 이메일로 관리됩니다."}
              </div>
            </div>
          ) : (
            <div style={{ ...styles.row, justifyContent: "space-between" }}>
              <span style={styles.hint}>비번 재설정은 Token 입력 방식</span>
              {resetStep === "request" ? (
                <button
                  type="button"
                  onClick={() => {
                    setResetStep("verify");
                    nav("/auth?mode=reset&step=verify", { replace: true });
                    setMsg(null);
                  }}
                  disabled={loading}
                  style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}
                  title="이미 메일을 받았다면 바로 Token 입력으로 이동"
                >
                  Token 입력 →
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75, color: "rgba(255,255,255,0.86)" }}>
        * 관리자 권한(Owner/Staff)은 로그인 후 서버 RPC(get_my_role)로 판별됩니다.
      </div>
    </div>
  );
}
