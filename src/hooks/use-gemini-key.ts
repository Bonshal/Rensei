"use client";

import { useEffect, useState } from "react";

const GEMINI_KEY_STORAGE = "rensei_gemini_api_key";

export function useGeminiKey() {
  const [key, setKey] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem(GEMINI_KEY_STORAGE);
    if (stored) setKey(stored);
  }, []);

  const saveKey = (newKey: string) => {
    localStorage.setItem(GEMINI_KEY_STORAGE, newKey);
    setKey(newKey);
  };

  const clearKey = () => {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    setKey("");
  };

  return { key, saveKey, clearKey, hasKey: key.length > 0 };
}
