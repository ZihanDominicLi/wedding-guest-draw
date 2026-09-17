"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

export function QrDownload({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "wedding-registration-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <section className="qr-tool" aria-labelledby="qr-title">
      <div>
        <p className="admin-eyebrow">Guest entry</p>
        <h2 id="qr-title">现场登记二维码</h2>
        <span>{value}</span>
      </div>
      <div className="qr-output">
        <QRCodeCanvas
          ref={canvasRef}
          value={value}
          size={192}
          marginSize={2}
          level="H"
          bgColor="#ffffff"
          fgColor="#20211d"
        />
        <button type="button" onClick={download} title="下载二维码 PNG">
          <Download size={18} aria-hidden="true" />
          下载 PNG
        </button>
      </div>
    </section>
  );
}
