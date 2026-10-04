// RTL page geometry for the mushaf's virtualized FlatList. Pure index<->page
// math, extracted from app/(tabs)/concepts.tsx so the paging DIRECTION is
// unit-testable without importing the screen (which pulls React Native deps).

/** Madinah-mushaf page count (1..604). */
export const TOTAL_PAGES = 604;

// Reversed page order so page 1 sits at the right end and paging progresses
// right→left like the printed mushaf. No scaleX transform anywhere (that would
// mirror the Qur'an), so if the swipe direction feels wrong on device this is
// the single switch to flip. DEVICE-TEST ITEM #1.
export const RTL_PAGING = true;

/** FlatList item index for a page number. */
export const pageToIndex = (page: number): number =>
  RTL_PAGING ? TOTAL_PAGES - page : page - 1;

/** Page number for a FlatList item index. */
export const indexToPage = (index: number): number =>
  RTL_PAGING ? TOTAL_PAGES - index : index + 1;
