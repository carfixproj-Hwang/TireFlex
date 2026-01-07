import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
}

/**
 * Supabase Auth 내부 Web Locks(navigator.locks)로 인해
 * getSession()/쿼리가 무한 대기하는 케이스 우회용 noOpLock
 * 참고: supabase-js issue #1594
 */
const noOpLock = async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
  return await fn();
};

function createSupabase(): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      lock: noOpLock,
    },
  });
}

/**
 * HMR(개발 중 핫리로드)에서 createClient가 여러 번 만들어지면
 * Auth가 꼬이거나 멈춤 증상이 더 잘 납니다.
 * 전역 싱글턴으로 고정.
 */
const g = globalThis as any;
export const supabase: SupabaseClient = g.__supabase ?? (g.__supabase = createSupabase());
