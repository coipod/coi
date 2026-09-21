import { t } from "../lib/i18n";
import { useState } from "react";
import { Modal } from "./Modal";
import { stickers, getSticker, type StickerId } from "../lib/stickers";
export function CoiAvatar() {
  const [failed, setFailed] = useState(false);
  return (
    <span className="message-avatar" aria-label="COI">
      {failed ? (
        "COI"
      ) : (
        <img
          src="/coi/sd/avatar.png"
          alt=""
          width="36"
          height="36"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
export function StickerImage({
  id,
  className = "",
}: {
  id?: string;
  className?: string;
}) {
  const sticker = getSticker(id);
  const [failedId, setFailedId] = useState<string>();
  if (!sticker || failedId === id) return null;
  return (
    <img
      className={`sticker-image ${className}`}
      src={`/coi/sd/${sticker.id}.png`}
      alt={t("{0} COI 스티커", [sticker.label])}
      width="112"
      height="112"
      onError={() => setFailedId(id)}
    />
  );
}
export function StickerPicker({
  onPick,
  onClose,
  focusAfterClose,
}: {
  onPick: (id: StickerId) => void;
  onClose: () => void;
  focusAfterClose?: () => HTMLElement | null;
}) {
  return (
    <Modal
      title={t("COI 스티커")}
      onClose={onClose}
      focusAfterClose={focusAfterClose}
    >
      {(close) => (
        <div className="sticker-picker">
          <p className="subtle">
            {t("마음을 고르면 부탁할 말이 담겨요. 고쳐 쓰고 보내 주세요.")}
          </p>
          <div className="sticker-grid">
            {stickers.map((sticker) => (
              <button
                type="button"
                key={sticker.id}
                onClick={() => {
                  onPick(sticker.id);
                  close();
                }}
                aria-label={t("{0} 스티커", [sticker.label])}
              >
                <StickerImage id={sticker.id} />
                <span>{sticker.label}</span>
              </button>
            ))}
          </div>
          <p className="footnote">{t("선택만으로 실행되지 않아요.")}</p>
        </div>
      )}
    </Modal>
  );
}
