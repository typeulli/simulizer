"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, type UserOut } from "@/lib/authapi";

let cachedUser: UserOut | null = null;
let fetchPromise: Promise<UserOut | null> | null = null;

export function clearUserCache() {
    cachedUser = null;
    fetchPromise = null;
}

function fetchUser(): Promise<UserOut | null> {
    if (!fetchPromise) {
        fetchPromise = getMe()
            .then(u => { cachedUser = u; return u; })
            .catch(() => { cachedUser = null; return null; })
            .finally(() => { fetchPromise = null; });
    }
    return fetchPromise;
}

export function useUser() {
    const [user, setUser] = useState<UserOut | null>(cachedUser);
    const [loading, setLoading] = useState(cachedUser === null);

    useEffect(() => {
        if (cachedUser) return;
        fetchUser().then(u => { setUser(u); setLoading(false); });
    }, []);

    return { user, loading };
}

export function useAuth() {
    const { user, loading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user === null) {
            router.replace("/login");
        }
    }, [loading, user, router]);

    return { user, loading };
}
