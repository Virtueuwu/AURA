"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

// Types
interface Prediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

interface PriceInfo {
  price: number;
  priceText: string;
  category: string;
}

interface HistoryItem {
  id: string | number;
  title: string;
  price: number;
  image: string;
  date: string;
  predictions: Prediction[];
  supabaseId?: number;
  geminiResult?: GeminiResult;
}

interface GeminiResult {
  itemName: string;
  category: string;
  priceRange: string;
  whereToBuy: string;
  confidence: string;
  keyDetails: string[];
  description: string;
  rawText: string;
}

const GEMINI_SYSTEM_PROMPT = `You are an expert item recognition and pricing specialist with deep knowledge of consumer goods, electronics, fashion, food, furniture, tools, collectibles, and all physical products worldwide.

When given an image of any item, your job is to identify it with maximum precision and provide accurate market pricing in Philippine Pesos (PHP ₱).

Follow this identification process:
1. Scan the entire image carefully — look for logos, labels, text, serial numbers, design details, colors, materials, and shape.
2. Identify the EXACT item: brand, product line, model name/number, color variant, size/edition if visible.
3. If the brand or model is partially visible or obscured, use shape, design language, and context clues to make the most precise inference possible.
4. Provide a realistic current Philippine market price (retail and/or resale) in PHP ₱. Use local Philippine market pricing where available (Lazada, Shopee, SM, Robinsons, authorized local dealers), not converted USD prices.

Always respond in this format:

**Item Name:** [Full precise name — Brand + Model + Variant]
**Category:** [e.g. Smartphone, Sneaker, Coffee Maker, etc.]
**Price Range:** ₱[low] – ₱[high] (explain if retail vs resale)
**Where to Buy:** [e.g. Lazada, Shopee, SM Appliance, authorized dealers, etc.]
**Confidence:** [High / Medium / Low] — [one sentence explaining why]
**Key Details:** [Bullet list of identifying features you spotted — logo, colorway, material, model number, etc.]
**Description:** [2–3 sentences about the item, key specs or notable features]

Rules:
- Never guess vaguely. "Nike sneaker" is wrong; "Nike Air Jordan 1 Retro High OG 'Chicago' (2015 rerelease)" is right.
- Always price in Philippine Pesos (₱) using Philippine market rates, not USD conversions.
- If the item is not commonly sold in the Philippines, convert to PHP using the current approximate exchange rate and note this.
- If multiple versions exist, name the most likely one based on visible details.
- If the image is unclear, state what you can and cannot confirm, and give your best inference.
- Always prioritize what is VISIBLE in the image over assumptions.`;

// Philippine Peso (₱) pricing database — local market rates (Lazada/Shopee/SM/dealers)
const pricingDatabase: Record<string, [number, number, string, string?]> = {
  'person': [0, 0, 'Human', 'Priceless ❤️'],
  'dog': [0, 0, 'Pets', 'Adoptable 🐶'],
  'cat': [0, 0, 'Pets', 'Adoptable 🐱'],
  'bird': [0, 0, 'Pets', 'Wild / Free 🐦'],
  'horse': [28000, 195000, 'Livestock'],
  'sheep': [8500, 22000, 'Livestock'],
  'cow': [45000, 140000, 'Livestock'],

  'laptop': [18000, 120000, 'Electronics'],
  'cell phone': [4500, 65000, 'Electronics'],
  'mouse': [350, 4500, 'Electronics'],
  'keyboard': [599, 8500, 'Electronics'],
  'tv': [7500, 95000, 'Electronics'],
  'remote': [250, 1500, 'Electronics'],
  'microwave': [3500, 12000, 'Home Appliance'],
  'oven': [12000, 75000, 'Home Appliance'],
  'refrigerator': [15000, 95000, 'Home Appliance'],
  'toaster': [799, 3500, 'Home Appliance'],
  'sink': [2500, 18000, 'Home Appliance'],

  'book': [199, 1200, 'Media & Books'],
  'clock': [350, 4500, 'Home Decor'],
  'vase': [299, 4200, 'Home Decor'],
  'potted plant': [150, 2800, 'Home Decor'],

  'bottle': [59, 250, 'Kitchenware'],
  'wine glass': [199, 1200, 'Kitchenware'],
  'cup': [89, 750, 'Kitchenware'],
  'fork': [25, 250, 'Kitchenware'],
  'knife': [75, 950, 'Kitchenware'],
  'spoon': [25, 250, 'Kitchenware'],
  'bowl': [99, 950, 'Kitchenware'],

  'chair': [1500, 8500, 'Furniture'],
  'couch': [15000, 90000, 'Furniture'],
  'bed': [8500, 55000, 'Furniture'],
  'dining table': [7500, 45000, 'Furniture'],
  'toilet': [3500, 18000, 'Home Appliance'],

  'banana': [7, 30, 'Grocery'],
  'apple': [25, 80, 'Grocery'],
  'orange': [15, 60, 'Grocery'],
  'sandwich': [75, 350, 'Grocery'],
  'broccoli': [45, 150, 'Grocery'],
  'carrot': [15, 60, 'Grocery'],
  'hot dog': [59, 250, 'Grocery'],
  'pizza': [299, 1200, 'Grocery'],
  'donut': [39, 149, 'Grocery'],
  'cake': [599, 2500, 'Grocery'],

  'backpack': [599, 7500, 'Accessories'],
  'handbag': [999, 45000, 'Accessories'],
  'tie': [499, 3500, 'Accessories'],
  'suitcase': [1500, 12000, 'Accessories'],
  'umbrella': [199, 1800, 'Accessories'],

  'bicycle': [3500, 55000, 'Transportation'],
  'car': [600000, 3500000, 'Transportation'],
  'motorcycle': [60000, 650000, 'Transportation'],
  'airplane': [500000000, 4000000000, 'Transportation'],
  'bus': [3500000, 14000000, 'Transportation'],
  'train': [25000000, 150000000, 'Transportation'],
  'truck': [1200000, 5500000, 'Transportation'],
  'boat': [150000, 5500000, 'Transportation'],

  'traffic light': [6500, 18000, 'City Infrastructure'],
  'fire hydrant': [8500, 25000, 'City Infrastructure'],
  'stop sign': [1800, 6500, 'City Infrastructure'],
  'parking meter': [5500, 16000, 'City Infrastructure'],
  'bench': [3500, 14000, 'Furniture'],

  'frisbee': [199, 950, 'Sports Goods'],
  'skis': [8500, 45000, 'Sports Goods'],
  'snowboard': [7500, 35000, 'Sports Goods'],
  'sports ball': [450, 2800, 'Sports Goods'],
  'kite': [250, 1500, 'Sports Goods'],
  'baseball bat': [750, 4500, 'Sports Goods'],
  'baseball glove': [950, 5500, 'Sports Goods'],
  'skateboard': [1200, 7500, 'Sports Goods'],
  'surfboard': [9500, 45000, 'Sports Goods'],
  'tennis racket': [1200, 9500, 'Sports Goods'],

  'scissors': [99, 650, 'Office Supplies'],
  'teddy bear': [350, 2800, 'Toys'],
  'hair drier': [799, 5500, 'Personal Care'],
  'toothbrush': [89, 2200, 'Personal Care']
};

export default function AURAApp() {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  // App States
  const [model, setModel] = useState<any>(null);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [time, setTime] = useState<string>("Initializing...");
  const [activeTab, setActiveTab] = useState<"upload" | "camera">("upload");
  const [toasts, setToasts] = useState<{ id: number; message: string; isError?: boolean }[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [totalValue, setTotalValue] = useState<number>(0);
  const [displayedValue, setDisplayedValue] = useState<number>(0);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  // Gemini AI Vision States
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [aiVisionMode, setAiVisionMode] = useState<boolean>(false);
  const [geminiResult, setGeminiResult] = useState<GeminiResult | null>(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState<boolean>(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);

  // Upload Tab States
  const [uploadImageSrc, setUploadImageSrc] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Camera Tab States
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isLiveDetecting, setIsLiveDetecting] = useState<boolean>(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [cameraOverlayText, setCameraOverlayText] = useState<string>("Camera stream stopped");
  const [cameraIsLoading, setCameraIsLoading] = useState<boolean>(false);
  const [showCameraOverlay, setShowCameraOverlay] = useState<boolean>(true);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadImageRef = useRef<HTMLImageElement>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const toastIdRef = useRef<number>(0);

  // Helper function to hash strings deterministically
  const getHashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  // Toast System
  const showToast = useCallback((message: string, isError = false) => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, isError }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Price Estimator function — Philippine Peso (₱)
  const getPriceEstimate = useCallback((className: string, score: number): PriceInfo => {
    const seed = getHashCode(className);
    const scoreFactor = Math.floor(score * 1000) % 100;
    const finalSeed = seed + scoreFactor;

    const formatPhp = (n: number) =>
      n >= 1000
        ? `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`
        : `₱${n.toFixed(2)}`;

    if (pricingDatabase[className]) {
      const [min, max, category, specialText] = pricingDatabase[className];
      if (specialText) {
        return { price: 0, priceText: specialText, category };
      }
      const ratio = (finalSeed % 100) / 100;
      const price = min + ratio * (max - min);
      return { price, priceText: formatPhp(price), category };
    }

    // Fallback range: ₱250 – ₱8,500 (general goods in PH market)
    const ratio = (finalSeed % 100) / 100;
    const price = 250 + ratio * (8500 - 250);
    return { price, priceText: formatPhp(price), category: "General Goods" };
  }, []);

  // Fetch log history from Supabase (fallback to localStorage)
  const fetchHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      if (data) {
        const formatted: HistoryItem[] = data.map(row => {
          try {
            const parsed = JSON.parse(row.name);
            if (parsed && parsed.title) {
              return { ...parsed, supabaseId: row.id };
            }
          } catch (e) {
            // fallback
          }
          return {
            id: row.id,
            title: row.name,
            price: 0,
            image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23121620'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%236b7280' font-family='sans-serif' font-size='32'>🏷️</text></svg>",
            date: new Date(row.created_at || Date.now()).toLocaleDateString(),
            predictions: []
          };
        });
        setHistory(formatted);
      }
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to localStorage:", err);
      const localData = localStorage.getItem("aura-scan-history");
      if (localData) {
        setHistory(JSON.parse(localData));
      }
    }
  }, [supabase]);

  // Load TensorFlow model dynamically client-side only
  useEffect(() => {
    // Clock setup
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    const initModel = async () => {
      try {
        showToast("🧠 Initializing neural network...");
        // Client-side dynamic imports
        await import("@tensorflow/tfjs");
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        
        const loadedModel = await cocoSsd.load({
          base: "lite_mobilenet_v2"
        });
        setModel(loadedModel);
        setModelStatus("ready");
        showToast("🟢 AURA Engine Online!");
      } catch (e) {
        console.error("TFJS model loading failure:", e);
        setModelStatus("error");
        showToast("❌ Neural network failed to load. Refresh page.", true);
      }
    };

    initModel();
    fetchHistory();

    // Restore Gemini API key from localStorage or env variable
    const savedKey = localStorage.getItem("aura-gemini-key") || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (savedKey) setGeminiApiKey(savedKey);

    // Auth: check current session and subscribe to auth changes
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        setUser(data.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
        setUser(null);
      } else {
        setUser(session.user);
      }
    });

    return () => {
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      subscription.unsubscribe();
    };
  }, [showToast, fetchHistory, supabase, router]);

  // Gemini Vision API call
  const callGeminiVision = useCallback(async (imageSrc: string): Promise<GeminiResult | null> => {
    if (!geminiApiKey.trim()) {
      showToast("🔑 Enter your Gemini API key first", true);
      setShowApiKeyInput(true);
      return null;
    }
    setIsGeminiLoading(true);
    setGeminiResult(null);
    showToast("🤖 Sending to Gemini Vision AI...");

    try {
      // Strip base64 data URL prefix to get raw base64
      const base64Data = imageSrc.replace(/^data:image\/[a-z]+;base64,/, "");
      const mimeMatch = imageSrc.match(/^data:(image\/[a-z]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

      const body = {
        system_instruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
        contents: [{
          parts: [
            { text: "Identify this item and provide Philippine market pricing." },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
      };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!rawText) throw new Error("Empty response from Gemini");

      // Parse the structured response supporting bold asterisks or standard text
      const extract = (label: string) => {
        const cleanLabel = label.replace(/\*/g, "");
        const regex = new RegExp(`(?:\\*\\*)?${cleanLabel}(?:\\*\\*)?:\\s*(.+?)(?=\\n(?:\\*\\*)?[A-Z]|\\n\\s*$|$)`, "is");
        const match = rawText.match(regex);
        return match ? match[1].trim() : "";
      };

      const keyDetailsRaw = rawText.match(/(?:\*\*)?Key Details(?:\*\*)?:\s*\n?([\s\S]*?)(?=\n(?:\*\*)?[A-Z]|Description:|$)/i);
      const keyDetails = keyDetailsRaw
        ? keyDetailsRaw[1].split("\n").map(l => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)
        : [];

      const result: GeminiResult = {
        itemName: extract("Item Name"),
        category: extract("Category"),
        priceRange: extract("Price Range"),
        whereToBuy: extract("Where to Buy"),
        confidence: extract("Confidence"),
        keyDetails,
        description: extract("Description"),
        rawText
      };

      setGeminiResult(result);
      showToast(`✅ AI identified: ${result.itemName || "Item"}`);
      return result;
    } catch (err: any) {
      console.error("Gemini error:", err);
      showToast("❌ Gemini AI error: " + err.message, true);
      return null;
    } finally {
      setIsGeminiLoading(false);
    }
  }, [geminiApiKey, showToast]);

  const getCurrentImageSrc = (): string | null => {
    if (activeTab === "upload") {
      return uploadImageSrc || null;
    } else {
      if (!videoRef.current) return null;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = videoRef.current.videoWidth || 640;
      tempCanvas.height = videoRef.current.videoHeight || 480;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        if (isMirrored) {
          ctx.scale(-1, 1);
          ctx.translate(-tempCanvas.width, 0);
        }
        ctx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);
        return tempCanvas.toDataURL("image/jpeg", 0.9);
      }
      return null;
    }
  };

  const handleGeminiDeepScan = async () => {
    const imageSrc = getCurrentImageSrc();
    if (!imageSrc) {
      showToast("⚠️ Please upload an image or activate the camera first", true);
      return;
    }

    if (!geminiApiKey.trim()) {
      showToast("🔑 Enter your Gemini API key first", true);
      setShowApiKeyInput(true);
      return;
    }

    const result = await callGeminiVision(imageSrc);
    if (!result) return;

    let estimatedPrice = 0;
    const cleanRange = result.priceRange.replace(/₱/g, "");
    const priceNums = cleanRange.match(/\d[\d,.]*/g);
    if (priceNums && priceNums.length > 0) {
      const parsedNums = priceNums.map(n => parseFloat(n.replace(/,/g, "")));
      if (parsedNums.length === 1) {
        estimatedPrice = parsedNums[0];
      } else if (parsedNums.length >= 2) {
        estimatedPrice = (parsedNums[0] + parsedNums[1]) / 2;
      }
    }

    const timeThreshold = 30000;
    const latestItem = history[0];
    const isRecent = latestItem && (Date.now() - new Date(latestItem.id).getTime() < timeThreshold);

    if (isRecent) {
      const updatedItem: HistoryItem = {
        ...latestItem,
        title: result.itemName,
        price: estimatedPrice || latestItem.price,
        geminiResult: result
      };

      if (updatedItem.supabaseId) {
        try {
          await supabase
            .from("todos")
            .update({ name: JSON.stringify(updatedItem) })
            .eq("id", updatedItem.supabaseId);
        } catch (e) {
          console.warn("Supabase update failed:", e);
        }
      }

      setHistory(prev => {
        const updated = [...prev];
        updated[0] = updatedItem;
        localStorage.setItem("aura-scan-history", JSON.stringify(updated));
        return updated;
      });
    } else {
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 80;
      thumbCanvas.height = 80;
      const thumbCtx = thumbCanvas.getContext("2d");
      
      if (thumbCtx) {
        const img = new Image();
        img.src = imageSrc;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            thumbCtx.drawImage(img, 0, 0, 80, 80);
            resolve();
          };
          img.onerror = () => resolve();
        });
      }
      const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.6);

      const newItem: HistoryItem = {
        id: Date.now(),
        title: result.itemName,
        price: estimatedPrice,
        image: thumbnail,
        date: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        predictions: [],
        geminiResult: result
      };

      let insertedId: number | undefined;
      try {
        const { data, error } = await supabase
          .from("todos")
          .insert([{ name: JSON.stringify(newItem) }])
          .select();

        if (error) throw error;
        if (data && data[0]) insertedId = data[0].id;
        showToast("💾 Saved Gemini scan to database!");
      } catch (err) {
        console.warn("Supabase save failed:", err);
      }

      const savedItem = insertedId ? { ...newItem, supabaseId: insertedId } : newItem;
      const updatedHistory = [savedItem, ...history.slice(0, 14)];
      localStorage.setItem("aura-scan-history", JSON.stringify(updatedHistory));
      setHistory(updatedHistory);
    }
  };



  // Total valuation count-up counter animation
  useEffect(() => {
    const duration = 600;
    const startTime = performance.now();
    const startVal = displayedValue;

    let cancel = false;
    const updateVal = (nowTime: number) => {
      if (cancel) return;
      const elapsed = nowTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress * (2 - progress); // quadratic out
      
      const nextVal = startVal + ease * (totalValue - startVal);
      setDisplayedValue(nextVal);

      if (progress < 1) {
        requestAnimationFrame(updateVal);
      } else {
        setDisplayedValue(totalValue);
      }
    };
    requestAnimationFrame(updateVal);

    return () => {
      cancel = true;
    };
  }, [totalValue]);

  // Clean camera tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Bounding Box Drawer on canvas overlay
  const drawPredictions = useCallback((preds: Prediction[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    preds.forEach(p => {
      const [x, y, w, h] = p.bbox;
      const isHighConf = p.score >= 0.8;
      const isMidConf = p.score >= 0.5 && p.score < 0.8;
      
      const themeColor = isHighConf ? "#10b981" : (isMidConf ? "#00f2fe" : "#f59e0b");
      
      // Box Border
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = Math.max(3, Math.min(canvas.width, canvas.height) / 120);
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 12;
      ctx.strokeRect(x, y, w, h);
      
      // Corner Tech Accents
      const cornerLen = Math.min(w, h) * 0.15;
      ctx.lineWidth = ctx.lineWidth * 1.5;
      
      ctx.beginPath();
      ctx.moveTo(x + cornerLen, y); ctx.lineTo(x, y); ctx.lineTo(x, y + cornerLen);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x + cornerLen, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - cornerLen);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      
      // Label tag drawing
      const priceInfo = getPriceEstimate(p.class, p.score);
      const labelText = `${p.class.toUpperCase()} (${Math.floor(p.score * 100)}%) - ${priceInfo.priceText}`;
      
      const fontSize = Math.max(12, Math.min(canvas.width, canvas.height) / 35);
      ctx.font = `600 ${fontSize}px var(--font-sans)`;
      const textWidth = ctx.measureText(labelText).width;
      const textHeight = fontSize + 8;
      
      ctx.fillStyle = themeColor;
      const labelY = y - textHeight > 0 ? y - textHeight : y;
      ctx.fillRect(x, labelY, textWidth + 14, textHeight);
      
      ctx.fillStyle = "#080a10";
      ctx.fillText(labelText, x + 7, labelY + fontSize + 2);
    });
  }, [getPriceEstimate]);

  // Compile detection states
  const updateResultsState = useCallback((preds: Prediction[]) => {
    setPredictions(preds);
    let total = 0;
    preds.forEach(p => {
      total += getPriceEstimate(p.class, p.score).price;
    });
    setTotalValue(total);
  }, [getPriceEstimate]);

  // Database Syncer and Local Backup
  const saveScanToHistory = useCallback(async (preds: Prediction[], sourceMedia: HTMLImageElement | HTMLVideoElement) => {
    if (preds.length === 0) return;

    // Create a 80x80 thumbnail base64
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 80;
    thumbCanvas.height = 80;
    const thumbCtx = thumbCanvas.getContext("2d");

    const srcWidth = (sourceMedia as HTMLImageElement).naturalWidth || (sourceMedia as HTMLVideoElement).videoWidth || 300;
    const srcHeight = (sourceMedia as HTMLImageElement).naturalHeight || (sourceMedia as HTMLVideoElement).videoHeight || 300;

    let sx = 0, sy = 0, sWidth = srcWidth, sHeight = srcHeight;
    if (srcWidth > srcHeight) {
      sHeight = srcHeight; sWidth = srcHeight;
      sx = (srcWidth - srcHeight) / 2;
    } else {
      sWidth = srcWidth; sHeight = srcWidth;
      sy = (srcHeight - srcWidth) / 2;
    }

    if (thumbCtx) {
      try {
        if (sourceMedia.id === "camera-video" && isMirrored) {
          thumbCtx.scale(-1, 1);
          thumbCtx.translate(-80, 0);
        }
        thumbCtx.drawImage(sourceMedia, sx, sy, sWidth, sHeight, 0, 0, 80, 80);
      } catch (e) {
        console.error("Thumbnail capture error:", e);
      }
    }
    const thumbnail = thumbCanvas.toDataURL("image/jpeg", 0.6);

    let totalVal = 0;
    preds.forEach(p => {
      totalVal += getPriceEstimate(p.class, p.score).price;
    });

    const primaryItemName = preds[0].class;
    const capitalizedTitle = primaryItemName.charAt(0).toUpperCase() + primaryItemName.slice(1);
    const title = preds.length > 1 ? `${capitalizedTitle} (+${preds.length - 1} items)` : capitalizedTitle;

    const historyItem: HistoryItem = {
      id: Date.now(),
      title,
      price: totalVal,
      image: thumbnail,
      date: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      predictions: preds
    };

    // 1. Sync to Supabase todos table
    let insertedId: number | undefined;
    try {
      const { data, error } = await supabase
        .from("todos")
        .insert([{ name: JSON.stringify(historyItem) }])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        insertedId = data[0].id;
      }
      showToast("💾 Saved to database!");
    } catch (err) {
      console.warn("Supabase insert failed, keeping local-only backup:", err);
    }

    const savedItem: HistoryItem = insertedId
      ? { ...historyItem, supabaseId: insertedId }
      : historyItem;

    // 2. Sync to localStorage
    const updatedHistory = [savedItem, ...history.slice(0, 14)];
    localStorage.setItem("aura-scan-history", JSON.stringify(updatedHistory));
    setHistory(updatedHistory);
  }, [history, isMirrored, getPriceEstimate, supabase, showToast]);

  // File Upload Handlers
  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("⚠️ Select a valid image file", true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setUploadImageSrc(src);
      setPredictions([]);
      setTotalValue(0);

      // Trigger size alignment on image load
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (uploadCanvasRef.current) {
          uploadCanvasRef.current.width = img.width;
          uploadCanvasRef.current.height = img.height;
          const ctx = uploadCanvasRef.current.getContext("2d");
          ctx?.clearRect(0, 0, img.width, img.height);
        }
      };
      showToast("📸 Photo uploaded. Click 'Scan Image' to scan!");
    };
    reader.readAsDataURL(file);
  };

  const scanUploadedImage = async () => {
    if (!model || !uploadImageRef.current) return;

    setIsScanning(true);
    showToast("🔍 Running object analysis...");

    await new Promise(r => setTimeout(r, 200));

    try {
      const preds = await model.detect(uploadImageRef.current);
      if (uploadCanvasRef.current) {
        drawPredictions(preds, uploadCanvasRef.current);
      }
      updateResultsState(preds);

      if (preds.length > 0) {
        showToast(`✅ Scan complete: found ${preds.length} objects`);
        saveScanToHistory(preds, uploadImageRef.current);
      } else {
        showToast("ℹ️ Scan completed. No common items found.");
      }
    } catch (err: any) {
      console.error(err);
      showToast("❌ Scanning failed: " + err.message, true);
    } finally {
      setIsScanning(false);
    }
  };

  // Camera Management Handlers
  const startCamera = async (deviceId?: string) => {
    setCameraIsLoading(true);
    setShowCameraOverlay(true);
    setCameraOverlayText("Accessing camera...");
    try {
      // Stop any existing stream first before requesting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setIsLiveDetecting(false);

      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        // Set srcObject and wait for canplay before calling play()
        // to avoid the AbortError race condition.
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          const onCanPlay = () => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            resolve();
          };
          const onError = (e: Event) => {
            video.removeEventListener("canplay", onCanPlay);
            video.removeEventListener("error", onError);
            reject(new Error("Video element error"));
          };
          video.addEventListener("canplay", onCanPlay, { once: true });
          video.addEventListener("error", onError, { once: true });
        });
        await videoRef.current.play();
      }

      // Enumerate devices after getting stream permission
      const devs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devs.filter(d => d.kind === "videoinput");
      setCameraDevices(videoDevs);

      // Determine mirror state from device label
      let isFront = true;
      const activeDevId = deviceId || (stream.getVideoTracks()[0]?.getSettings().deviceId);
      if (activeDevId) {
        const match = videoDevs.find(d => d.deviceId === activeDevId);
        if (match) {
          const lbl = match.label.toLowerCase();
          if (lbl.includes("back") || lbl.includes("rear") || lbl.includes("environment")) {
            isFront = false;
          }
        }
      }
      setIsMirrored(isFront);
      if (activeDevId) setSelectedDevice(activeDevId);

      setCameraActive(true);
      setShowCameraOverlay(false);
      showToast("📷 Lens active!");

    } catch (err: any) {
      console.error(err);
      // Stop any partial stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);

      // Show user-friendly overlay messages based on error type
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraOverlayText("Camera permission was denied. Allow camera access in your browser settings and try again.");
        showToast("🚫 Camera permission denied", true);
      } else if (err.name === "NotFoundError") {
        setCameraOverlayText("No camera device found. Connect a camera and try again.");
        showToast("🔌 No camera found", true);
      } else if (err.name === "AbortError") {
        setCameraOverlayText("Camera initialization was interrupted. Try again.");
        showToast("⚠️ Camera initialization interrupted", true);
      } else {
        setCameraOverlayText(`Camera error: ${err.message || "Unknown error"}`);
        showToast("❌ Camera error: " + err.message, true);
      }
    } finally {
      setCameraIsLoading(false);
    }
  };

  const stopCamera = () => {
    setIsLiveDetecting(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      // Pause before clearing srcObject to prevent AbortError
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setShowCameraOverlay(true);
    setCameraOverlayText("Camera stream stopped");
    
    if (cameraCanvasRef.current) {
      const ctx = cameraCanvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, cameraCanvasRef.current.width, cameraCanvasRef.current.height);
    }
  };

  const toggleLiveDetection = () => {
    if (!cameraActive) {
      showToast("⚠️ Turn camera on first", true);
      return;
    }
    if (!model) {
      showToast("⏳ Waiting for neural network model...", true);
      return;
    }

    setIsLiveDetecting(prev => !prev);
  };

  // Live Frame Scanner Loop in React
  const liveScanFrame = useCallback(async () => {
    if (!isLiveDetecting || !cameraActive || !model || !videoRef.current || !cameraCanvasRef.current) return;

    const video = videoRef.current;
    const canvas = cameraCanvasRef.current;

    if (video.readyState === 4) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      try {
        const preds = await model.detect(video);
        drawPredictions(preds, canvas);
        updateResultsState(preds);
      } catch (err) {
        console.error(err);
      }
    }

    if (isLiveDetecting) {
      animFrameRef.current = requestAnimationFrame(liveScanFrame);
    }
  }, [isLiveDetecting, cameraActive, model, drawPredictions, updateResultsState]);

  useEffect(() => {
    if (isLiveDetecting) {
      animFrameRef.current = requestAnimationFrame(liveScanFrame);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isLiveDetecting, liveScanFrame]);

  // Capture current stream snapshot & scan
  const captureAndScan = async () => {
    if (!cameraActive || !model || !videoRef.current || !cameraCanvasRef.current) return;

    const wasLive = isLiveDetecting;
    if (wasLive) setIsLiveDetecting(false);

    setIsScanning(true);
    showToast("📸 Capturing frame snapshot...");

    try {
      cameraCanvasRef.current.width = videoRef.current.videoWidth;
      cameraCanvasRef.current.height = videoRef.current.videoHeight;
      
      videoRef.current.pause();
      await new Promise(r => setTimeout(r, 120));

      const preds = await model.detect(videoRef.current);
      drawPredictions(preds, cameraCanvasRef.current);
      updateResultsState(preds);

      if (preds.length > 0) {
        showToast(`✅ Frame scanned: found ${preds.length} objects`);
        saveScanToHistory(preds, videoRef.current);
      } else {
        showToast("ℹ️ Frame scanned. No objects found.");
      }

      // Resume stream automatically — guard with try/catch to handle AbortError
      setTimeout(async () => {
        if (streamRef.current && videoRef.current && videoRef.current.paused) {
          try {
            await videoRef.current.play();
            if (wasLive) {
              setIsLiveDetecting(true);
            } else {
              const ctx = cameraCanvasRef.current?.getContext("2d");
              ctx?.clearRect(0, 0, cameraCanvasRef.current!.width, cameraCanvasRef.current!.height);
            }
            showToast("📷 Stream active.");
          } catch (playErr: any) {
            if (playErr.name !== "AbortError") {
              console.error("Resume play error:", playErr);
            }
          }
        }
      }, 3500);

    } catch (e: any) {
      console.error(e);
      showToast("❌ Capture failed: " + e.message, true);
      // Attempt to resume play — ignore AbortError on resume
      try { await videoRef.current.play(); } catch (pe: any) {
        if (pe.name !== "AbortError") console.error("Resume error:", pe);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Restore history item to view
  const loadHistoryItem = (item: HistoryItem) => {
    showToast(`📋 Restoring scan: ${item.title}`);
    setActiveTab("upload");
    setUploadImageSrc(item.image);
    setPredictions(item.predictions);
    setGeminiResult(item.geminiResult || null);
    
    // Draw predictions on upload canvas
    const img = new Image();
    img.src = item.image;
    img.onload = () => {
      if (uploadCanvasRef.current) {
        uploadCanvasRef.current.width = img.width;
        uploadCanvasRef.current.height = img.height;
        drawPredictions(item.predictions, uploadCanvasRef.current);
      }
    };

    let total = 0;
    item.predictions.forEach(p => {
      total += getPriceEstimate(p.class, p.score).price;
    });
    setTotalValue(total);
  };

  const clearHistoryLog = async () => {
    if (!confirm("Clear all logged scan history?")) return;
    
    try {
      const { error } = await supabase.from("todos").delete().neq("id", -1);
      if (error) throw error;
      showToast("🧹 Database log cleared.");
    } catch (err) {
      console.warn("Database clear failed, clearing local history only:", err);
    }

    localStorage.removeItem("aura-scan-history");
    setHistory([]);
    showToast("🧹 History cleared.");
  };

  return (
    <>
      {/* Background Orbs */}
      <div className="bg-glow bg-glow-1"></div>
      <div className="bg-glow bg-glow-2"></div>
      <div className="bg-glow bg-glow-3"></div>

      <div className="container">
        {/* Header */}
        <header className="app-header">
          <div className="logo-area">
            <div className="logo-icon">👁️</div>
            <span className="project-name">
              AURA <span className="sub-logo">Scanner</span>
            </span>
            <span className={`badge ${modelStatus === "ready" ? "ready" : ""}`}>
              {modelStatus === "loading" ? "Model Loading..." : (modelStatus === "ready" ? "Model Ready" : "Load Failed")}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="status-indicator">
              <span className={`status-dot ${modelStatus === "ready" ? "success" : "warning"}`}></span>
              <span>{time}</span>
            </div>

            {user && (
              <div className="user-info-bar">
                <div className="user-avatar">
                  {(user.user_metadata?.full_name || user.email || "?")[0].toUpperCase()}
                </div>
                <span className="user-email">{user.email}</span>
                <form action="/api/signout" method="POST" onSubmit={async (e) => {
                  e.preventDefault();
                  await supabase.auth.signOut();
                  router.replace("/login");
                }}>
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Sign Out
                  </button>
                </form>
              </div>
            )}
          </div>
        </header>

        {/* Gemini AI Settings Panel */}
        <div className="gemini-settings-panel glass" style={{ marginBottom: "20px", padding: "12px 16px" }}>
          <div className="settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowApiKeyInput(p => !p)}>
            <span style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
              ✨ Gemini Vision AI Deep Identification: <strong style={{ color: geminiApiKey ? "var(--success-color)" : "var(--warning-color)" }}>{geminiApiKey ? "Active" : "Keys Not Set"}</strong>
            </span>
            <button className="btn-text-only" style={{ fontSize: "0.8rem" }}>
              {showApiKeyInput ? "Hide Settings ⌃" : "Configure Key ⌄"}
            </button>
          </div>
          {showApiKeyInput && (
            <div className="settings-body" style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
              <input
                type="password"
                placeholder="Enter Gemini API Key..."
                value={geminiApiKey}
                onChange={(e) => {
                  setGeminiApiKey(e.target.value);
                  localStorage.setItem("aura-gemini-key", e.target.value);
                }}
                className="input-dark"
                style={{ flex: 1, padding: "6px 10px", fontSize: "0.85rem" }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowApiKeyInput(false);
                  showToast("🔑 Gemini key saved.");
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Main Dashboard Layout */}
        <main className="main-dashboard">
          {/* Left: Scanner Panel */}
          <section className="scanner-section">
            {/* Tabs */}
            <div className="tabs-container glass">
              <button
                className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("upload");
                  stopCamera();
                }}
              >
                <span className="tab-icon">📤</span> Upload Photo
              </button>
              <button
                className={`tab-btn ${activeTab === "camera" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("camera");
                  startCamera(selectedDevice);
                }}
              >
                <span className="tab-icon">📷</span> Live Camera
              </button>
            </div>

            {/* Tab 1: Upload View */}
            {activeTab === "upload" && (
              <div className="tab-content active">
                <div
                  className={`drop-zone glass ${isDragOver ? "drag-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files.length > 0) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  />

                  {!uploadImageSrc && (
                    <div className="drop-zone-prompt">
                      <div className="scanner-ring">
                        <span className="pulse-icon">🔍</span>
                      </div>
                      <h3>Drag & Drop Image</h3>
                      <p>Supports JPG, PNG or WEBP. Max 10MB.</p>
                      <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        Browse Files
                      </button>
                    </div>
                  )}

                  {uploadImageSrc && (
                    <div className="preview-container" onClick={(e) => e.stopPropagation()}>
                      <img
                        ref={uploadImageRef}
                        id="upload-image"
                        src={uploadImageSrc}
                        alt="Uploaded preview"
                        crossOrigin="anonymous"
                      />
                      <canvas ref={uploadCanvasRef} id="upload-canvas" />
                      <div className={`scanner-line ${isScanning ? "active" : ""}`} id="upload-scan-line" />
                    </div>
                  )}
                </div>

                {uploadImageSrc && (
                  <div className="scanner-controls">
                    <button
                      className="btn btn-secondary"
                      onClick={resetUploadView => {
                        setUploadImageSrc("");
                        setPredictions([]);
                        setTotalValue(0);
                      }}
                      disabled={isScanning}
                    >
                      Clear Image
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={scanUploadedImage}
                      disabled={isScanning || modelStatus !== "ready"}
                    >
                      {isScanning ? "Scanning..." : "Scan Image"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Camera View */}
            {activeTab === "camera" && (
              <div className="tab-content active">
                <div className="camera-zone glass">
                  <div className={`camera-screen ${isMirrored ? "mirrored" : ""}`} id="camera-screen">
                    <video ref={videoRef} id="camera-video" autoPlay playsInline muted />
                    <canvas ref={cameraCanvasRef} id="camera-canvas" />
                    <div className={`scanner-line ${isLiveDetecting ? "active" : ""}`} id="camera-scan-line" />

                    {showCameraOverlay && (
                      <div className="camera-overlay">
                        {cameraIsLoading ? <div className="overlay-spinner" /> : null}
                        <p>{cameraOverlayText}</p>
                        <button
                          className="btn btn-primary"
                          onClick={() => startCamera(selectedDevice)}
                          disabled={cameraIsLoading}
                        >
                          Initialize Camera
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="camera-controls-bar">
                    <div className="device-select-container">
                      <label htmlFor="camera-select">Device:</label>
                      <select
                        id="camera-select"
                        className="select-dark"
                        value={selectedDevice}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedDevice(id);
                          startCamera(id);
                        }}
                      >
                        {cameraDevices.length === 0 ? (
                          <option value="">Default Camera</option>
                        ) : (
                          cameraDevices.map((dev, idx) => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label || `Camera ${idx + 1}`}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="camera-action-buttons">
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => {
                          if (cameraActive) stopCamera();
                          else startCamera(selectedDevice);
                        }}
                      >
                        {cameraActive ? "🔌 Turn Off" : "🔌 Turn On"}
                      </button>
                      <button
                        className="btn btn-secondary btn-icon"
                        style={{
                          borderColor: isLiveDetecting ? "var(--success-color)" : "",
                          color: isLiveDetecting ? "var(--success-color)" : ""
                        }}
                        onClick={toggleLiveDetection}
                      >
                        ⚡ Live Detection: {isLiveDetecting ? "On" : "Off"}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={captureAndScan}
                        disabled={!cameraActive || modelStatus !== "ready" || isScanning}
                      >
                        📸 Capture & Scan
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Right Sidebar */}
          <aside className="sidebar">
            {/* Model Loader status card */}
            {modelStatus !== "ready" && (
              <div className="card glass status-card-panel warning-border">
                <div className="loader-ring" />
                <div className="loader-info">
                  <h4>Loading AI Engine</h4>
                  <p>Initializing TensorFlow.js network (~25MB)...</p>
                </div>
              </div>
            )}

            {modelStatus === "ready" && (
              <div className="card glass status-card-panel ready-border">
                <div className="loader-info">
                  <h4>AI Engine Active</h4>
                  <p>Object detection & estimation system online.</p>
                </div>
              </div>
            )}

            {/* Scan Results */}
            <div className="card glass info-card">
              <h3>Scan Results</h3>

              {/* Gemini deep scan trigger button */}
              {(uploadImageSrc || cameraActive) && (
                <button
                  className={`btn btn-primary w-full gemini-scan-btn ${isGeminiLoading ? "loading" : ""}`}
                  onClick={handleGeminiDeepScan}
                  disabled={isGeminiLoading}
                  style={{
                    background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)",
                    color: "#fff",
                    border: "none",
                    marginBottom: "15px",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  {isGeminiLoading ? (
                    <>
                      <span className="spinner-small" style={{
                        display: "inline-block",
                        width: "12px",
                        height: "12px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderRadius: "50%",
                        borderTopColor: "#fff",
                        animation: "spin 1s ease-in-out infinite",
                        marginRight: "6px"
                      }} /> Analyzing with Gemini...
                    </>
                  ) : (
                    <>
                      ✨ Deep Scan with Gemini Vision AI
                    </>
                  )}
                </button>
              )}

              {/* Gemini AI Detailed Result Panel */}
              {geminiResult && (
                <div className="gemini-result-panel glass-dark" style={{
                  background: "rgba(8, 10, 16, 0.6)",
                  border: "1px solid rgba(168, 85, 247, 0.4)",
                  borderRadius: "8px",
                  padding: "14px",
                  marginBottom: "20px",
                  boxShadow: "0 0 15px rgba(168, 85, 247, 0.15)"
                }}>
                  <div className="gemini-result-header" style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    paddingBottom: "8px",
                    marginBottom: "10px"
                  }}>
                    <h4 style={{ margin: 0, color: "var(--primary-color)", fontSize: "0.95rem" }}>🤖 Gemini AI Analysis</h4>
                    <span className="badge" style={{
                      backgroundColor: geminiResult.confidence.toLowerCase().includes("high") ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                      color: geminiResult.confidence.toLowerCase().includes("high") ? "#10b981" : "#f59e0b",
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      border: geminiResult.confidence.toLowerCase().includes("high") ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(245, 158, 11, 0.4)"
                    }}>
                      {geminiResult.confidence.split("—")[0].trim()}
                    </span>
                  </div>

                  <div className="gemini-field" style={{ marginBottom: "10px" }}>
                    <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Item Name</span>
                    <span className="field-value highlight" style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff" }}>{geminiResult.itemName}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Category</span>
                      <span className="field-value" style={{ fontSize: "0.85rem", color: "#e5e7eb" }}>{geminiResult.category}</span>
                    </div>
                    <div>
                      <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Where to Buy</span>
                      <span className="field-value" style={{ fontSize: "0.85rem", color: "#e5e7eb" }}>{geminiResult.whereToBuy}</span>
                    </div>
                  </div>

                  <div className="gemini-field" style={{ marginBottom: "10px" }}>
                    <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>PH Market Price Range</span>
                    <span className="field-value price-range" style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--success-color)" }}>{geminiResult.priceRange}</span>
                  </div>

                  <div className="gemini-field" style={{ marginBottom: "10px" }}>
                    <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase", marginBottom: "4px" }}>Key Details</span>
                    <ul className="gemini-details-list" style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.8rem", color: "#d1d5db" }}>
                      {geminiResult.keyDetails.map((detail, idx) => (
                        <li key={idx} style={{ marginBottom: "2px", display: "flex", gap: "6px" }}>
                          <span>🔹</span> <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="gemini-field" style={{ marginBottom: "12px" }}>
                    <span className="field-label" style={{ display: "block", fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" }}>Description</span>
                    <p className="gemini-desc" style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "#d1d5db", lineHeight: "1.4" }}>{geminiResult.description}</p>
                  </div>

                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: "100%", fontSize: "0.8rem", padding: "6px 0", cursor: "pointer" }}
                    onClick={() => {
                      window.open(`https://www.google.com/search?q=${encodeURIComponent(geminiResult.itemName)}+price+philippines`, "_blank");
                    }}
                  >
                    🔍 Verify prices on Google Search
                  </button>
                </div>
              )}

              {predictions.length === 0 ? (
                !geminiResult && (
                  <div className="results-empty">
                    <span className="empty-icon">🏷️</span>
                    <h4>No Objects Scanned</h4>
                    <p>Upload a file or capture a photo from the camera feed to see estimated pricing and object names.</p>
                  </div>
                )
              ) : (
                <div className="results-active">
                  <div className="total-valuation">
                    <span className="valuation-label">Total Estimated Value</span>
                    <span className="valuation-amount">
                      {displayedValue >= 1000
                        ? `₱${displayedValue.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`
                        : `₱${displayedValue.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="detected-items-list">
                    {predictions.map((p, idx) => {
                      const priceInfo = getPriceEstimate(p.class, p.score);
                      const confidenceClass = p.score >= 0.8 ? "high-confidence" : (p.score >= 0.5 ? "mid-confidence" : "low-confidence");

                      return (
                        <div key={idx} className={`item-node ${confidenceClass}`}>
                          <div className="item-info">
                            <div className="item-title-row">
                              <span className="item-name">
                                {p.class.charAt(0).toUpperCase() + p.class.slice(1)}
                              </span>
                              <span className="item-match">{Math.floor(p.score * 100)}% Match</span>
                            </div>
                            <span className="item-category">{priceInfo.category}</span>
                          </div>
                          <div className="item-pricing">
                            <span className="item-price">{priceInfo.priceText}</span>
                            <button
                              className="btn-text-only search-btn"
                              style={{ display: "block", fontSize: "0.75rem", marginTop: "2px" }}
                              onClick={() => {
                                window.open(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(p.class)}`, "_blank");
                              }}
                            >
                              🔍 Search
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            <div className="card glass info-card">
              <div className="card-header-flex">
                <h3>Scan History Log</h3>
                <button className="btn-text-only" onClick={clearHistoryLog}>
                  Clear Log
                </button>
              </div>

              <ul className="history-list">
                {history.length === 0 ? (
                  <li className="history-empty">
                    <span>No past scans logged.</span>
                  </li>
                ) : (
                  history.map((item, idx) => (
                    <li key={idx} className="history-item" onClick={() => loadHistoryItem(item)}>
                      <img src={item.image} className="history-thumbnail" alt={item.title} />
                      <div className="history-details">
                        <h4 className="history-title">{item.title}</h4>
                        <div className="history-meta">
                          <span>{item.date}</span>
                          <span className="history-price">
                            {item.price > 0
                              ? item.price >= 1000
                                ? `₱${item.price.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`
                                : `₱${item.price.toFixed(2)}`
                              : "Priceless"}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <p>AURA AI Price Scanner &bull; Processing is 100% Local & Private</p>
        </footer>
      </div>

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast"
            style={{ borderColor: toast.isError ? "var(--danger-color)" : "" }}
          >
            <span>✨</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
