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

export default function AdminOpsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [row, setRow] = useState<OpsSettingsRow | null>(null);
  const [liftCap, setLiftCap] = useState<number>(1);

  const canSave = useMemo(() => {
    const current = Number(row?.max_batch_qty ?? 1);
    return clampInt(liftCap, 1, 20) !== clampInt(current, 1, 20);
  }, [liftCap, row?.max_batch_qty]);

  const previewText = useMemo(() => {
    const cap = clampInt(liftCap, 1, 20);
    return `동시간대 최대 ${cap}건까지 작업 가능 (리프트 ${cap}대 기준)`;
  }, [liftCap]);

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

      const cap = clampInt(Number(data?.max_batch_qty ?? 1), 1, 20);
      setLiftCap(cap);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRow(null);
      setLiftCap(1);
    } finally {
      setLoading(false);
    }
  }

  async function saveLiftCap() {
    const cap = clampInt(liftCap, 1, 20);

    setSaving(true);
    setMsg(null);
    try {
      const r = await supabase.rpc("admin_set_lift_capacity", { new_cap: cap });
      if (r.error) throw new Error(r.error.message);

      await refresh();
      setMsg("✅ 저장 완료");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
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
          <div className="aosSub">리프트 개수(동시간대 동시 작업 가능 수)를 관리합니다.</div>
        </div>

        <button className="aosBtn" onClick={refresh} disabled={loading || saving}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <div className="aosGrid">
        <div className="aosCard">
          <div className="aosCardTitle">리프트 개수</div>
          <div className="aosCardDesc">리프트 대수 = 동시에 처리 가능한 예약 수(같은 시간대 중복 허용 개수)</div>

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

          <div className="aosActions">
            <button
              className="aosBtnGhost"
              type="button"
              onClick={() => setLiftCap(clampInt(Number(row?.max_batch_qty ?? 1), 1, 20))}
              disabled={loading || saving || !row}
            >
              원복
            </button>

            <button className="aosBtnPrimary" type="button" onClick={saveLiftCap} disabled={loading || saving || !canSave}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>

          {msg ? <div className="aosMsg">{msg}</div> : null}
        </div>

        <div className="aosCard">
          <div className="aosCardTitle">현재 운영값(읽기 전용)</div>
          <div className="aosCardDesc">ops_settings(id=1) 기준으로 표시됩니다.</div>

          <div className="aosKv">
            <div className="aosK">영업 시간</div>
            <div className="aosV">
              {row?.open_time && row?.close_time ? `${String(row.open_time).slice(0, 5)} ~ ${String(row.close_time).slice(0, 5)}` : "-"}
            </div>

            <div className="aosK">슬롯</div>
            <div className="aosV">{row?.slot_minutes != null ? `${row.slot_minutes}분` : "-"}</div>

            <div className="aosK">동시 작업(기타)</div>
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
