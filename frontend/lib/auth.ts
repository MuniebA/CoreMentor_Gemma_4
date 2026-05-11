// frontend/lib/auth.ts

export const saveToken = (token: string) => {
    localStorage.setItem("access_token", token);
};

export const getToken = (): string | null => {
    return localStorage.getItem("access_token");
};

export const removeToken = () => {
    localStorage.removeItem("access_token");
};

export const saveRole = (role: string) => {
    localStorage.setItem("user_role", role);
};

export const getRole = (): string | null => {
    return localStorage.getItem("user_role");
};

export const saveName = (name: string) => {
    localStorage.setItem("full_name", name);
};

export const getName = (): string | null => {
    return localStorage.getItem("full_name");
};

export const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("full_name");
    window.location.href = "/";
};

export const authHeaders = () => ({
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json"
});