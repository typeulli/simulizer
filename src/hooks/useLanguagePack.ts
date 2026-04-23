import en from "@/lang/en";
import langpack from "@/lang/lang";
import { useEffect, useState } from "react";

const LS_LANG_KEY = "language";
const LS_PACK_KEY = "language_pack";
const LS_ETAG_KEY = "language_pack_etag";

function loadCachedPack(): langpack | null {
    try {
        const raw = localStorage.getItem(LS_PACK_KEY);
        return raw ? (JSON.parse(raw) as langpack) : null;
    } catch {
        return null;
    }
}

export default function useLanguagePack() {
    const [lang, setLang] = useState<string | null>(null);
    const [initialized, setInitialized] = useState(false);
    const [pack, setPack] = useState<langpack>(en);

    useEffect(() => {
        const storedLang = localStorage.getItem(LS_LANG_KEY);
        if (storedLang) {
            setLang(storedLang);
        }
        const cachedPack = loadCachedPack();
        if (cachedPack) {
            setPack(cachedPack);
        }
        setInitialized(true);
    }, []);

    useEffect(() => {
        if (!initialized) return;
        const tgt = lang || "auto";
        if (lang) {
            localStorage.setItem(LS_LANG_KEY, lang);
        }
        const etag = localStorage.getItem(LS_ETAG_KEY);
        const headers: HeadersInit = etag ? { "If-None-Match": etag } : {};
        fetch(`/api/lang/${tgt}`, { headers })
            .then((res) => {
                if (res.status === 304) return null;
                const newEtag = res.headers.get("ETag");
                if (newEtag) localStorage.setItem(LS_ETAG_KEY, newEtag);
                return res.json() as Promise<langpack>;
            })
            .then((data) => {
                if (!data) return;
                setPack(data);
                localStorage.setItem(LS_PACK_KEY, JSON.stringify(data));
                if (!lang) {
                    setLang(data.meta.langc);
                }
            })
            .catch((err) => {
                console.error("언어팩 로드 실패:", err);
            });
    }, [lang, initialized]);

    return [lang, setLang, pack, initialized] as const;
}