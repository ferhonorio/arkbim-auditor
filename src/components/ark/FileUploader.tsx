import { useRef, useState } from "react";
import { Upload, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseFile } from "@/lib/parse";
import { useArk, getLastFile, setLastFile } from "@/lib/store";
import { toast } from "sonner";

export function FileUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const setDataset = useArk((s) => s.setDataset);
  const dataset = useArk((s) => s.dataset);

  const handle = async (file: File) => {
    try {
      const ds = await parseFile(file);
      setDataset(ds);
      setLastFile(file);
      toast.success(`${ds.rows.length.toLocaleString("pt-BR")} linhas carregadas`);
    } catch (e) {
      toast.error("Falha ao ler o arquivo");
      console.error(e);
    }
  };

  const reload = async () => {
    const f = getLastFile();
    if (!f) {
      toast.error("Nenhum arquivo anterior. Carregue um arquivo primeiro.");
      return;
    }
    await handle(f);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) await handle(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Carregar CSV ou XLSX</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Arraste o arquivo aqui ou clique para selecionar
        </p>
        {dataset && (
          <p className="mt-2 truncate text-xs text-primary" title={dataset.fileName}>
            {dataset.fileName}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
          }}
        />
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={reload}>
        <RotateCw className="mr-2 h-3.5 w-3.5" />
        Recarregar dados do anexo
      </Button>
    </div>
  );
}
