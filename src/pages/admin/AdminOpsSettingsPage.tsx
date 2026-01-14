// src/pages/admin/AdminOpsSettingsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "../../styles/adminOpsSettings.css";

type OpsSettingsRow = {
  id: number;
  max_batch_qty: number | null;
  open_time?: string | null;
  close_time?: string | null;
  slot_minutes?: number | null;
  capacity?: number | null;
  tz?: string | null;
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeHHMM(v: any): string {
  if (!v) return "";
  const s = String(v);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s.slice(0, 5);
}

function isRpcNotFound(err: any): boolean {
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const msg = String(err?.message ?? "").toLowerCase();
  return status === 404 || msg.includes("not found");
}

function timeToMinutes(hhmm: string): number {
  const m = (hhmm || "").match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

export default function AdminOpsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [row, setRow] = useState<OpsSettingsRow | null>(null);

  // ✅ 편집 값들
  const [liftCap, setLiftCap] = useState<number>(1);
  const [openHHMM, setOpenHHMM] = useState<string>("09:00");
  const [closeHHMM, setCloseHHMM] = useState<string>("18:00");

  const [slotMinutes, setSlotMinutes] = useState<number>(30);
  const [capacity, setCapacity] = useState<number>(1);
  const [tz, setTz] = useState<string>("Asia/Seoul");

  const canSave = useMemo(() => {
    if (!row) return false;

    const currentLift = clampInt(Number(row.max_batch_qty ?? 1), 1, 20);
    const currentOpen = normalizeHHMM(row.open_time);
    const currentClose = normalizeHHMM(row.close_time);
    const currentSlot = clampInt(Number(row.slot_minutes ?? 30), 5, 240);
    const currentCap = clampInt(Number(row.capacity ?? 1), 1, 50);
    const currentTz = String(row.tz ?? "Asia/Seoul");

    return (
      clampInt(liftCap, 1, 20) !== currentLift ||
      normalizeHHMM(openHHMM) !== currentOpen ||
      normalizeHHMM(closeHHMM) !== currentClose ||
      clampInt(slotMinutes, 5, 240) !== currentSlot ||
      clampInt(capacity, 1, 50) !== currentCap ||
      String(tz || "Asia/Seoul") !== currentTz
    );
  }, [row, liftCap, openHHMM, closeHHMM, slotMinutes, capacity, tz]);

  const previewText = useMemo(() => {
    const cap = clampInt(liftCap, 1, 20);
    return `동시간대 최대 ${cap}건까지 작업 가능 (리프트 ${cap}대 기준)`;
  }, [liftCap]);

  const timeWarning = useMemo(() => {
    const a = timeToMinutes(openHHMM);
    const b = timeToMinutes(closeHHMM);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "시간 형식을 확인하세요.";
    if (a >= b) return "영업 종료는 시작보다 늦어야 합니다.";
    return null;
  }, [openHHMM, closeHHMM]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await supabase
        .from("ops_settings")
        .select("id,max_batch_qty,open_time,close_time,slot_minutes,capacity,tz")
        .eq("id", 1)
        .maybeSingle();

      if (r.error) throw new Error(r.error.message);

      const data = (r.data ?? null) as any;
      setRow(data);

      setLiftCap(clampInt(Number(data?.max_batch_qty ?? 1), 1, 20));
      setOpenHHMM(normalizeHHMM(data?.open_time) || "09:00");
      setCloseHHMM(normalizeHHMM(data?.close_time) || "18:00");
      setSlotMinutes(clampInt(Number(data?.slot_minutes ?? 30), 5, 240));
      setCapacity(clampInt(Number(data?.capacity ?? 1), 1, 50));
      setTz(String(data?.tz ?? "Asia/Seoul"));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRow(null);

      setLiftCap(1);
      setOpenHHMM("09:00");
      setCloseHHMM("18:00");
      setSlotMinutes(30);
      setCapacity(1);
      setTz("Asia/Seoul");
    } finally {
      setLoading(false);
    }
  }

  async function saveAll() {
    const cap = clampInt(liftCap, 1, 20);
    const open = normalizeHHMM(openHHMM);
    const close = normalizeHHMM(closeHHMM);
    const slot = clampInt(slotMinutes, 5, 240);
    const cap2 = clampInt(capacity, 1, 50);
    const tz2 = String(tz || "Asia/Seoul");

    // 기본 검증
    const a = timeToMinutes(open);
    const b = timeToMinutes(close);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      setMsg("시간 형식을 확인하세요. (예: 09:00)");
      return;
    }
    if (a >= b) {
      setMsg("영업 종료는 시작보다 늦어야 합니다.");
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      // ✅ 1) RPC가 있으면 우선 사용(권한/RLS 문제를 가장 깔끔하게 해결)
      const tryRpc = await supabase.rpc("admin_update_ops_settings", {
        open_time: open,
        close_time: close,
        slot_minutes: slot,
        capacity: cap2,
        tz: tz2,
        max_batch_qty: cap,
      } as any);

      if (tryRpc.error) {
        // RPC가 없으면 direct update로 fallback
        if (!isRpcNotFound(tryRpc.error)) {
          throw new Error(tryRpc.error.message);
        }

        const u = await supabase
          .from("ops_settings")
          .update({
            open_time: open,
            close_time: close,
            slot_minutes: slot,
            capacity: cap2,
            tz: tz2,
            max_batch_qty: cap,
          })
          .eq("id", 1);

        if (u.error) throw new Error(u.error.message);
      }

      await refresh();
      setMsg("✅ 저장 완료");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  function revertToDb() {
    if (!row) return;
    setLiftCap(clampInt(Number(row.max_batch_qty ?? 1), 1, 20));
    setOpenHHMM(normalizeHHMM(row.open_time) || "09:00");
    setCloseHHMM(normalizeHHMM(row.close_time) || "18:00");
    setSlotMinutes(clampInt(Number(row.slot_minutes ?? 30), 5, 240));
    setCapacity(clampInt(Number(row.capacity ?? 1), 1, 50));
    setTz(String(row.tz ?? "Asia/Seoul"));
    setMsg(null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="aosShell">
      <div className="aosBg" aria-hidden />

      <div className="aosHead">
        <div>
          <div className="aosTitle">운영 설정</div>
          <div className="aosSub">영업시간/슬롯/수용량/리프트 값을 유동적으로 관리합니다.</div>
        </div>

        <button className="aosBtn" onClick={refresh} disabled={loading || saving}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <div className="aosGrid">
        {/* ✅ 편집 카드 */}
        <div className="aosCard">
          <div className="aosCardTitle">운영값 수정</div>
          <div className="aosCardDesc">ops_settings(id=1)에 저장됩니다. (RPC가 없으면 direct update로 시도)</div>

          {/* 영업시간 */}
          <div className="aosKv" style={{ marginTop: 10 }}>
            <div className="aosK">영업 시작</div>
            <div className="aosV">
              <input
                className="aosInput"
                type="time"
                value={openHHMM}
                onChange={(e) => setOpenHHMM(e.target.value)}
                disabled={loading || saving}
              />
            </div>

            <div className="aosK">영업 종료</div>
            <div className="aosV">
              <input
                className="aosInput"
                type="time"
                value={closeHHMM}
                onChange={(e) => setCloseHHMM(e.target.value)}
                disabled={loading || saving}
              />
            </div>

            <div className="aosK">슬롯(분)</div>
            <div className="aosV">
              <input
                className="aosInput"
                type="number"
                min={5}
                max={240}
                step={5}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(clampInt(Number(e.target.value), 5, 240))}
                disabled={loading || saving}
                aria-label="슬롯 분"
              />
            </div>

            <div className="aosK">동시 수용(대)</div>
            <div className="aosV">
              <input
                className="aosInput"
                type="number"
                min={1}
                max={50}
                step={1}
                value={capacity}
                onChange={(e) => setCapacity(clampInt(Number(e.target.value), 1, 50))}
                disabled={loading || saving}
                aria-label="수용량"
              />
            </div>

            <div className="aosK">타임존</div>
            <div className="aosV">
              <input
                className="aosInput"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                disabled={loading || saving}
                placeholder="Asia/Seoul"
              />
            </div>
          </div>

          {/* 리프트 */}
          <div style={{ marginTop: 14 }}>
            <div className="aosCardTitle" style={{ fontSize: 14 }}>리프트 개수</div>
            <div className="aosCardDesc">리프트 대수 = 같은 시간대 중복 허용 개수</div>

            <div className="aosLiftRow">
              <button
                className="aosIconBtn"
                type="button"
                onClick={() => setLiftCap((v) => clampInt(v - 1, 1, 20))}
                disabled={loading || saving || liftCap <= 1}
                aria-label="감소"
              >
                −
              </button>

              <div className="aosLiftInputWrap">
                <input
                  className="aosInput"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={liftCap}
                  onChange={(e) => setLiftCap(clampInt(Number(e.target.value), 1, 20))}
                  disabled={loading || saving}
                  aria-label="리프트 개수"
                />
                <div className="aosUnit">대</div>
              </div>

              <button
                className="aosIconBtn"
                type="button"
                onClick={() => setLiftCap((v) => clampInt(v + 1, 1, 20))}
                disabled={loading || saving || liftCap >= 20}
                aria-label="증가"
              >
                +
              </button>
            </div>

            <div className="aosPreview">{previewText}</div>
          </div>

          {timeWarning ? (
            <div className="aosMsg" style={{ marginTop: 10 }}>
              ⚠️ {timeWarning}
            </div>
          ) : null}

          <div className="aosActions" style={{ marginTop: 12 }}>
            <button className="aosBtnGhost" type="button" onClick={revertToDb} disabled={loading || saving || !row}>
              원복
            </button>

            <button className="aosBtnPrimary" type="button" onClick={saveAll} disabled={loading || saving || !canSave}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>

          {msg ? <div className="aosMsg">{msg}</div> : null}
        </div>

        {/* ✅ 현재값 표시 카드 */}
        <div className="aosCard">
          <div className="aosCardTitle">현재 운영값(읽기)</div>
          <div className="aosCardDesc">DB에서 가져온 값을 표시합니다.</div>

          <div className="aosKv">
            <div className="aosK">영업 시간</div>
            <div className="aosV">
              {row?.open_time && row?.close_time
                ? `${normalizeHHMM(row.open_time)} ~ ${normalizeHHMM(row.close_time)}`
                : "-"}
            </div>

            <div className="aosK">슬롯</div>
            <div className="aosV">{row?.slot_minutes != null ? `${row.slot_minutes}분` : "-"}</div>

            <div className="aosK">동시 수용</div>
            <div className="aosV">{row?.capacity != null ? `${row.capacity}대` : "-"}</div>

            <div className="aosK">타임존</div>
            <div className="aosV">{row?.tz ? String(row.tz) : "Asia/Seoul"}</div>

            <div className="aosK">리프트(저장값)</div>
            <div className="aosV">{row?.max_batch_qty != null ? `${row.max_batch_qty}대` : "1대(기본)"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
