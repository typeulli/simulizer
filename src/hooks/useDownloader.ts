import { useCallback } from "react";

export default function useDownloader() {
    const download = useCallback((filename: string, content: Blob | string) => {
        const url = URL.createObjectURL(typeof content === "string" ? new Blob([content]) : content);
        const a   = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);
    return { download };
}