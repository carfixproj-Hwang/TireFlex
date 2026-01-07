import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT: ${label} (${ms}ms)`)), ms);

    fn()
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export default function DebugPage() {
  const [log, setLog] = useState<string>("");

  useEffect(() => {
    (async () => {
      const lines: string[] = [];
      const push = (s: string) => {
        lines.push(s);
        setLog(lines.join("\n"));
      };

      try {
        push("1) getSession 시작...");
        const s = await withTimeout(() => supabase.auth.getSession(), 6000, "auth.getSession");
        push("✅ getSession OK");
        push(JSON.stringify({ hasSession: !!s.data.session }, null, 2));

        const uid = s.data.session?.user?.id;
        if (!uid) {
          push("세션 없음: /auth로 로그인 후 다시 테스트");
          return;
        }

        push("2) rpc is_admin 시작...");
        const a = await withTimeout(
          async () => {
            // builder를 Promise로 바꾸기 위해 await로 감싸서 반환
            return await supabase.rpc("is_admin", { uid });
          },
          6000,
          "rpc is_admin"
        );
        push("✅ is_admin OK");
        push(JSON.stringify(a, null, 2));

        push("3) select profiles 시작...");
        const p = await withTimeout(
          async () => {
            return await supabase.from("profiles").select("id,email").eq("id", uid).maybeSingle();
          },
          6000,
          "select profiles"
        );
        push("✅ profiles OK");
        push(JSON.stringify(p, null, 2));
      } catch (e: any) {
        push("❌ ERROR");
        push(String(e?.message ?? e));
      }
    })();
  }, []);

  return (
    <div style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Supabase Debug</h2>
      <div>{log || "..."}</div>
    </div>
  );
}
