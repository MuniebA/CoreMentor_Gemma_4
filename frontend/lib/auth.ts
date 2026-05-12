// frontend/lib/auth.ts

const getStorage = (): Storage | null => {
    if (typeof window === "undefined") return null;
    if (!window.localStorage || typeof window.localStorage.getItem !== "function") return null;
    return window.localStorage;
};

export const saveToken = (token: string) => {
    getStorage()?.setItem("access_token", token);
};

export const getToken = (): string | null => {
    return getStorage()?.getItem("access_token") || null;
};

export const removeToken = () => {
    getStorage()?.removeItem("access_token");
};

export const saveRole = (role: string) => {
    getStorage()?.setItem("user_role", role);
};

export const getRole = (): string | null => {
    return getStorage()?.getItem("user_role") || null;
};

export const saveName = (name: string) => {
    getStorage()?.setItem("full_name", name);
};

export const getName = (): string | null => {
    return getStorage()?.getItem("full_name") || null;
};

export const logout = () => {
    const storage = getStorage();
    storage?.removeItem("access_token");
    storage?.removeItem("user_role");
    storage?.removeItem("full_name");
    if (typeof window !== "undefined") window.location.href = "/";
};

export const authHeaders = () => ({
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json"
});
