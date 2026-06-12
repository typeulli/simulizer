import type langpack from "@/i18n/lang";

declare module "next-intl" {
    interface AppConfig {
        // The message catalog shape. Using `langpack` (the authoritative shape
        // type) means `useMessages()` returns it directly — no casts needed —
        // and keeps a single source of truth for the nested structure.
        Messages: langpack;
    }
}
