import express from "express";
import path from "path";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Global cache for rapid responses
const translateCache = new Map<string, string>();

const buildSystemInstruction = (prompt1?: string, prompt2?: string, dictContext?: string) => {
  return `Bạn là một DỊCH GIẢ CHUYÊN NGHIỆP 25 tuổi, chuyên dịch văn học Trung-Việt dồi dào kinh nghiệm cổ phong.
Nhiệm vụ: Dịch văn bản tiếng Trung sang tiếng Việt với độ chính xác tuyệt đối, trung thành hoàn toàn về mặt nội dung, bảo toàn cấu trúc dòng gốc.

BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT CÁC ÁNH XẠ ĐẠI TỪ NHÂN XƯNG SAU ĐÂY:
- 我 -> ta
- 你 -> ngươi
- 您 -> ngài
- 他 -> hắn (luôn là "hắn", tuyệt đối không đổi đại từ này!)
- 她 -> nàng
- 它 -> nó
- 我们 -> chúng ta | 咱们 -> chúng ta
- 你们 -> các ngươi
- 您们 -> các ngài
- 她们 -> các nàng
- 它们 -> bọn họ
- 诸位 -> chư vị
- 同学 -> bạn học | 同学们 -> các bạn học
- 老师 -> lão sư | 老师们 -> các lão sư
- 哥 -> ca | 弟 -> đệ
- 叔 -> thúc | 舅 -> cữu
- 姨 -> di | 阿姨 -> a di
- 奶奶 -> bà bà | 妈妈 -> mụ mụ | 爷爷 -> gia gia
- 老板 -> lão bản | 女士 -> nữ sĩ | 这女人 -> nữ nhân này

CÁC RÀNG BUỘC KỸ THUẬT QUAN TRỌNG:
1. TRUNG THÀNH TUYỆT ĐỐI: Dịch đúng, đủ, không thêm thắt bớt xén tình tiết nào.
2. CẤU TRÚC DÒNG: Giữ nguyên vẹn số hàng và ngắt đoạn, 1 dòng gốc tiếng Trung tương ứng với đúng 1 dòng tiếng Việt đã dịch. KHÔNG được phép gộp hai dòng hoặc tự ý tách rời đoạn gốc.
3. Liên từ "和" nên được dịch là "cùng" thay vì "và".
4. Giữ nguyên các đơn vị tiền tệ, đơn vị đo lường trong bản gốc.
5. Tuyệt đối KHÔNG sử dụng các Trợ từ ngữ khí dư thừa hằng ngày (như nha, nga, đi, ba, nột, bỉ, hử, nhé) trong câu kết quả dịch văn học.
6. Sử dụng từ vựng Hán Việt cổ điển, lịch thiệp và sang trọng để thể hiện thần vận thế giới Tiên Hiệp.

${dictContext ? `DANH MỤC THUẬT NGỮ BẮT BUỘC ÁP DỤNG:\n${dictContext}` : ""}

${prompt1 ? `HƯỚNG DẪN THÊM 1:\n${prompt1}` : ""}
${prompt2 ? `HƯỚNG DẪN THÊM 2:\n${prompt2}` : ""}
`;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper: Pick active rotating API key from comma-separated string
  const getActiveKey = (keyString: string): string => {
    if (!keyString) return "";
    const keys = keyString.split(",").map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) return "";
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  };

  // REST API: Translate chunk or prompt
  app.post("/api/translate", async (req, res) => {
    const { text, model, temperature, apiKeys = {}, prompt1, prompt2, dictContext } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Nội dung gốc văn bản bị trống." });
    }

    const cacheKey = `${model}_${temperature}_${prompt1}_${prompt2}_${dictContext}_${text.trim().substring(0, 100)}`;
    if (translateCache.has(cacheKey)) {
      return res.json({ translation: translateCache.get(cacheKey) });
    }

    const systemInstruction = buildSystemInstruction(prompt1, prompt2, dictContext);
    const selectModel = model || "gemini-3.5-flash";
    const activeTemp = typeof temperature === "number" ? temperature : 0.3;

    try {
      // 1. GOOGLE GEMINI MODELS
      if (selectModel.startsWith("gemini-")) {
        const clientKey = getActiveKey(apiKeys.google) || process.env.GEMINI_API_KEY;
        if (!clientKey) {
          return res.status(401).json({ error: "Chưa thiết lập Google Gemini API Key. Vui lòng truy cập Cài đặt để bổ sung." });
        }

        const ai = new GoogleGenAI({
          apiKey: clientKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const response = await ai.models.generateContent({
          model: selectModel,
          contents: text,
          config: {
            systemInstruction,
            temperature: activeTemp,
          }
        });

        const finalResult = response.text || "";
        translateCache.set(cacheKey, finalResult);
        return res.json({ translation: finalResult });
      }

      // 2. OPENAI GPT MODELS
      if (selectModel.startsWith("gpt-") || selectModel.startsWith("o3-")) {
        const clientKey = getActiveKey(apiKeys.openai);
        if (!clientKey) {
          return res.status(401).json({ error: "Chưa cấu hình OpenAI API Key trong thẻ Cài đặt tệp để gọi dòng máy dịch này." });
        }

        const isReasoningModel = selectModel.startsWith("o3-");
        
        const payload: any = {
          model: selectModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: text }
          ],
        };

        if (!isReasoningModel) {
          payload.temperature = activeTemp;
        }

        const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clientKey}`
          }
        });

        const ans = response.data?.choices?.[0]?.message?.content || "";
        translateCache.set(cacheKey, ans);
        return res.json({ translation: ans });
      }

      // 3. ANTHROPIC CLAUDE MODELS
      if (selectModel.startsWith("claude-")) {
        const clientKey = getActiveKey(apiKeys.claude);
        if (!clientKey) {
          return res.status(401).json({ error: "Chưa nhập Anthropic Claude API Key trong cấu hình." });
        }

        const response = await axios.post("https://api.anthropic.com/v1/messages", {
          model: selectModel,
          max_tokens: 4000,
          system: systemInstruction,
          messages: [{ role: "user", content: text }],
          temperature: activeTemp
        }, {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": clientKey,
            "anthropic-version": "2023-06-01"
          }
        });

        const ans = response.data?.content?.[0]?.text || "";
        translateCache.set(cacheKey, ans);
        return res.json({ translation: ans });
      }

      // 4. DEEPSEEK MODELS
      if (selectModel.startsWith("deepseek-")) {
        const clientKey = getActiveKey(apiKeys.deepseek);
        if (!clientKey) {
          return res.status(401).json({ error: "Chưa bổ sung DeepSeek API Key. Khuyên dùng nạp trực tiếp tại thẻ Cài Đặt." });
        }

        const payload: any = {
          model: selectModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: text }
          ]
        };

        if (selectModel !== "deepseek-reasoner") {
          payload.temperature = activeTemp;
        }

        const response = await axios.post("https://api.deepseek.com/chat/completions", payload, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clientKey}`
          }
        });

        const ans = response.data?.choices?.[0]?.message?.content || "";
        translateCache.set(cacheKey, ans);
        return res.json({ translation: ans });
      }

      // 5. ALIBABA QWEN MODELS
      if (selectModel.startsWith("qwen-")) {
        const clientKey = getActiveKey(apiKeys.qwen);
        if (!clientKey) {
          return res.status(401).json({ error: "Chưa cấu hình Alibaba Qwen (DashScope) API Key." });
        }

        const response = await axios.post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
          model: selectModel,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: text }
          ],
          temperature: activeTemp
        }, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clientKey}`
          }
        });

        const ans = response.data?.choices?.[0]?.message?.content || "";
        translateCache.set(cacheKey, ans);
        return res.json({ translation: ans });
      }

      return res.status(400).json({ error: `Hệ thống chưa hỗ trợ model xưng xô ${selectModel}.` });

    } catch (err: any) {
      console.error("Translation api error: ", err?.response?.data || err.message);
      const details = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
      return res.status(500).json({ error: `Kết nối máy dịch thất bại: ${details}` });
    }
  });

  // REST API: Quick phrase lookup translation
  app.post("/api/translate-phrase", async (req, res) => {
    const { phrase, apiKeys = {}, model = "gemini-3.5-flash" } = req.body;
    if (!phrase || !phrase.trim()) {
      return res.json({ vietphrase: "" });
    }

    try {
      const clientKey = getActiveKey(apiKeys.google) || process.env.GEMINI_API_KEY;
      if (!clientKey) {
        // Fallback silently to direct han viet offline translation in client
        return res.json({ vietphrase: "" });
      }

      const ai = new GoogleGenAI({
        apiKey: clientKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Bạn là từ điển Hán Việt. Hãy dịch từ/cụm từ sau sang tiếng Việt nghĩa phù hợp nhất của truyện tiên hiệp, ngôn tình dứt khoát chỉ trả về đúng cụm từ nghĩa kết quả tiếng Việt, không giải thích gì thêm:\nHán tự: ${phrase}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.1,
        }
      });

      const ans = (response.text || "").trim().toLowerCase();
      return res.json({ vietphrase: ans });
    } catch {
      return res.json({ vietphrase: "" });
    }
  });

  // REST API: Align Vietnamese phrase back to Chinese phrase in source paragraph
  app.post("/api/align-phrase", async (req, res) => {
    const { paragraph, vietnamese, apiKeys = {} } = req.body;
    if (!paragraph || !vietnamese) {
      return res.json({ chinese: "" });
    }

    try {
      const clientKey = getActiveKey(apiKeys.google) || process.env.GEMINI_API_KEY;
      if (!clientKey) {
        return res.json({ chinese: "" });
      }

      const ai = new GoogleGenAI({
        apiKey: clientKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Từ đoạn văn tiếng Trung sau: "${paragraph}"\nHãy tìm và trích xuất đúng cụm từ/chữ tiếng Trung tương ứng với cụm từ bản dịch tiếng Việt sau: "${vietnamese}".\nLưu ý: Chỉ trả về duy nhất chữ/cụm từ gốc tiếng Trung được tìm thấy bên trong đoạn văn đó, không giải thích, không thêm dấu mở ngoặc kép hay bất kỳ ký tự nào khác.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.1,
        }
      });

      const ans = (response.text || "").trim();
      return res.json({ chinese: ans });
    } catch {
      return res.json({ chinese: "" });
    }
  });

  // Vite middleware for development vs static asset delivery for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Vite Server] Full-Stack App running at http://localhost:${PORT}`);
  });
}

startServer();
