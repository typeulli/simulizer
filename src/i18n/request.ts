import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./locales";

/** Resolve the active locale with no URL routing: cookie first, then the
 *  browser's Accept-Language header, then the default. */
async function resolveLocale(): Promise<Locale> {
    const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieLocale)) return cookieLocale;

    const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
    if (/\ben\b|en-/.test(accept) && !/\bko\b|ko-/.test(accept)) return "en";
    if (/\bko\b|ko-/.test(accept)) return "ko";

    return defaultLocale;
}

export default getRequestConfig(async () => {
    const locale = await resolveLocale();
    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
    };
});
