#!/usr/bin/env python3
"""Fix the personal advice in index.tsx to use AsyncStorage caching and longer timeout"""

with open('/home/ubuntu/opvoedadvies_apk/app/(tabs)/index.tsx', 'r') as f:
    content = f.read()

# Replace the useEffect and fetchPersonalAdvice function
old_code = """  useEffect(() => {
    if (state.parentProfileCompleted && !llmLoading) {
      setLlmAdvice(null);
      fetchPersonalAdvice();
    }
  }, [state.parentProfileCompleted, language]);
  async function fetchPersonalAdvice() {
    setLlmLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const now = new Date();
      const response = await fetch(`${baseUrl}/api/advice/general`, {"""

if old_code in content:
    print("Found exact match - proceeding with full replacement")
else:
    print("Exact match not found, trying line-by-line approach")
    # Find the lines and replace them
    lines = content.split('\n')
    start_idx = None
    end_idx = None
    for i, line in enumerate(lines):
        if 'useEffect(() => {' in line and i > 400:
            # Check if next line has parentProfileCompleted
            if i+1 < len(lines) and 'parentProfileCompleted' in lines[i+1] and 'llmLoading' in lines[i+1]:
                start_idx = i
        if start_idx and 'finally { setLlmLoading(false); }' in line:
            end_idx = i + 1  # include the closing brace line
            break
    
    if start_idx is not None and end_idx is not None:
        print(f"Found code block from line {start_idx+1} to {end_idx+1}")
        # Find the end of fetchPersonalAdvice function (the closing brace after finally)
        # Look for the closing } of the function
        brace_count = 0
        func_end = end_idx
        for i in range(start_idx, len(lines)):
            if 'async function fetchPersonalAdvice' in lines[i]:
                # Count braces from here
                for j in range(i, len(lines)):
                    brace_count += lines[j].count('{') - lines[j].count('}')
                    if brace_count == 0 and j > i:
                        func_end = j + 1
                        break
                break
        
        print(f"Function ends at line {func_end}")
        
        new_code_lines = """  useEffect(() => {
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
            if (!c.birthDate) return tx(lang, "onbekend", "unknown", "\\u063a\\u064a\\u0631 \\u0645\\u0639\\u0631\\u0648\\u0641");
            return `${c.name}: ${now.getFullYear() - new Date(c.birthDate).getFullYear()} ${tx(lang, "jaar", "years", "\\u0633\\u0646\\u0629")}`;
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
  }""".split('\n')
        
        lines = lines[:start_idx] + new_code_lines + lines[func_end:]
        content = '\n'.join(lines)
        
        with open('/home/ubuntu/opvoedadvies_apk/app/(tabs)/index.tsx', 'w') as f:
            f.write(content)
        print("SUCCESS: Replaced with cached version")
    else:
        print(f"ERROR: Could not find code block. start={start_idx}, end={end_idx}")
