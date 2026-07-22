# Quran Screen Fixes Needed

## Bug 1: Page separator / frame sizing
- `.page-container` has `height: 100%` + `padding: 8px`
- `.page-frame` has `height: 100%` + `padding: 12px 8px`
- The frame doesn't always fill the available space properly
- Fix: Remove fixed height from page-frame, use flex:1 or min-height, and adjust padding

## Bug 2: Empty iraab and hidayat
- `fetchIraab` and `fetchHidayat` hardcode: `https://3000-iibxfcpazx79qwy1usyz1-51d01fa5.us2.manus.computer`
- This URL is from an OLD sandbox session and no longer works!
- The correct approach: use `getApiBaseUrl()` from `@/constants/oauth`
- On web: empty string (relative URL)
- On native: use the dynamic base URL from env

## Bug 3: No page separators between pages
- When swiping between pages, there's no visual separator/transition
- Need to add a brief loading state or transition animation

## Fix plan:
1. Import `getApiBaseUrl` from `@/constants/oauth`
2. Replace hardcoded URLs with `getApiBaseUrl()`
3. Fix page-frame CSS to properly fill the WebView
4. Add page number display at bottom of frame
