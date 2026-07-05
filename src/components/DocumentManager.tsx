import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listDocuments, uploadDocument, deleteDocument } from "@/lib/documents.functions";
import { toast } from "sonner";
import { FileText, Upload, Trash2, Download, File, Image, FileSpreadsheet } from "lucide-react";

interface DocumentManagerProps {
  entityType: "grant" | "proposal" | "submission" | "funder";
  entityId: string;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "application/msword": FileText,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileText,
  "application/vnd.ms-excel": FileSpreadsheet,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": FileSpreadsheet,
  "image/png": Image,
  "image/jpeg": Image,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DocumentManager({ entityType, entityId }: DocumentManagerProps) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchDocs = useServerFn(listDocuments);
  const { data: documents = [] } = useQuery({
    queryKey: ["documents", entityType, entityId],
    queryFn: () => fetchDocs({ data: { entityType, entityId } }),
  });

  const fetchUpload = useServerFn(uploadDocument);
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });
      return fetchUpload({
        data: {
          entityType,
          entityId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          base64Data: base64,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
      toast.success("Document uploaded");
      setUploading(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    },
  });

  const fetchDelete = useServerFn(deleteDocument);
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => fetchDelete({ data: { documentId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", entityType, entityId] });
      toast.success("Document deleted");
    },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large (max 20MB)");
      return;
    }
    setUploading(true);
    uploadMutation.mutate(file);
    e.target.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents ({documents.length})
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1 h-3 w-3" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No documents attached.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const Icon = FILE_ICONS[doc.mime_type] || File;
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatBytes(doc.file_size)} · {doc.mime_type.split("/").pop()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => deleteMutation.mutate(doc.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
