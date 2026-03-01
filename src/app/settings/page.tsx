"use client";

import { useState, useEffect } from "react";
import { useGeminiKey } from "@/hooks/use-gemini-key";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, Eye, EyeOff, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { key, saveKey, clearKey, hasKey } = useGeminiKey();
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (key) setInputKey(key);
  }, [key]);

  const handleSave = () => {
    if (!inputKey.trim()) {
      toast.error("Please enter a valid API key");
      return;
    }
    saveKey(inputKey.trim());
    toast.success("API key saved");
  };

  const handleClear = () => {
    clearKey();
    setInputKey("");
    toast.success("API key removed");
  };

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your Rensei experience
        </p>
      </div>

      {/* Gemini API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            Gemini API Key
            {hasKey && (
              <Badge variant="default" className="ml-2">
                <CheckCircle className="mr-1 h-3 w-3" />
                Configured
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Required for syllabus parsing and quiz generation. Your key is stored
            locally in your browser and never sent to our servers.
          </p>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="Enter your Gemini API key"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
          {hasKey && (
            <Button variant="outline" size="sm" onClick={handleClear}>
              Remove Key
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Get your API key from{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google AI Studio
            </a>
          </p>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About Rensei</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Rensei</strong> is an autonomous AI-powered study planner.
            The student studies. The AI plans.
          </p>
          <p>
            It uses spaced repetition (SM-2 algorithm) and exam urgency to
            decide what you should study next, adapting automatically to your
            performance and missed sessions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
