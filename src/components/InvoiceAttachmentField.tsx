"use client";

import { useEffect, useRef } from "react";
import { MAX_MOVEMENT_INVOICE_SIZE } from "@/lib/movement-invoice-policy";

export default function InvoiceAttachmentField({ file, onChange, onError, disabled }: { file: File | null; onChange: (file: File | null) => void; onError: (message: string) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file && input.current) input.current.value = ""; }, [file]);
  return <div className="field">
    <label>Nota fiscal da saída (opcional)
      <input ref={input} className="input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" disabled={disabled} style={{ display: "block", marginTop: 8 }} onChange={(event) => {
        const selected = event.target.files?.[0] || null;
        if (selected && (selected.size <= 0 || selected.size > MAX_MOVEMENT_INVOICE_SIZE || !/\.(pdf|xml|jpe?g|png)$/i.test(selected.name))) {
          event.target.value = ""; onChange(null); onError("Envie uma NF em PDF, XML, JPG ou PNG de até 3 MB."); return;
        }
        onChange(selected); onError("");
      }} />
    </label>
    <small style={{ color: "#94a3b8" }}>PDF, XML, JPG ou PNG • Até 3 MB. O arquivo será salvo com a saída.</small>
    {file && <div><small>{file.name}</small> <button type="button" className="btn btn-gray" disabled={disabled} onClick={() => onChange(null)}>Remover anexo</button></div>}
  </div>;
}
