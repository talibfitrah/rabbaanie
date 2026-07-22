#!/usr/bin/env python3
with open('app/(tabs)/index.tsx', 'r') as f:
    content = f.read()

old_start = content.find('  useEffect(() => {\n    if (state.parentProfileCompleted && !llmLoading)')
old_end_marker = 'finally { setLlmLoading(false); }\n  }'
old_end = content.find(old_end_marker, old_start)

if old_start < 0 or old_end < 0:
    print("ERROR: Could not find code block")
    exit(1)

old_end += len(old_end_marker)
print(f"Found code block at positions {old_start}-{old_end}")

new_code = '''  useEffect(() => {
    if (state.parentProfileCompleted) {
      loadCachedAdvice();
    }
  }, [state.parentProfileCompleted, language]);

  async function loadCachedAdvice() {
    try {
      const cacheKey = `personal_advice_${language}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { advice, timestamp } = JSON.parse(cached);
        const hoursSince = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (hoursSince < 12 && advice) {
          setLlmAdvice(advice);
          return;
        }
      }
    } catch (e) {}
    fetchPersonalAdvice();
  }

  async function fetchPersonalAdvice() {
    setLlmLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const now = new Date();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(`${baseUrl}/api/advice/general`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          parentProfile: state.parentProfile,
          childrenCount: state.children.length,
          childrenAges: state.children.map((c) => {
            if (!c.birthDate) return tx(lang, "onbekend", "unknown", "\u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641");
            return `${c.name}: ${now.getFullYear() - new Date(c.birthDate).getFullYear()} ${tx(lang, "jaar", "years", "\u0633\u0646\u0629")}`;
          }),
          season: currentSeason,
          location: cityName || "Nederland",
          language,
          hijriMonth: hijri.month,
          hijriDay: hijri.day,
          dayOfWeek: now.getDay(),
        }),
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      const adviceText = data.advice || null;
      setLlmAdvice(adviceText);
      if (adviceText) {
        const cacheKey = `personal_advice_${language}`;
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ advice: adviceText, timestamp: Date.now() }));
      }
    } catch (e) {
      try {
        const cacheKey = `personal_advice_${language}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { advice } = JSON.parse(cached);
          if (advice) { setLlmAdvice(advice); return; }
        }
      } catch (e2) {}
      setLlmAdvice(null);
    }
    finally { setLlmLoading(false); }
  }'''

content = content[:old_start] + new_code + content[old_end:]

with open('app/(tabs)/index.tsx', 'w') as f:
    f.write(content)

print("SUCCESS")
