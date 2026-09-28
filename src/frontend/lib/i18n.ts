// Global i18n — persisted language + a translation dictionary.
// Keys are the English string; t() falls back to the key when a translation
// is missing, so untranslated bits simply stay English.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "en" | "gu" | "hi";

export const LANGS: { code: Lang; label: string; name: string }[] = [
  { code: "en", label: "EN", name: "English" },
  { code: "gu", label: "ગુ", name: "ગુજરાતી" },
  { code: "hi", label: "हि", name: "हिन्दी" },
];

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>()(
  persist((set) => ({ lang: "en", setLang: (lang) => set({ lang }) }), {
    name: "bob-lang",
  })
);

type Entry = { gu: string; hi: string };
const DICT: Record<string, Entry> = {
  // --- header / chrome ---
  "Crime Intelligence": { gu: "ક્રાઇમ ઇન્ટેલિજન્સ", hi: "क्राइम इंटेलिजेंस" },
  "Gandhinagar District": { gu: "ગાંધીનગર જિલ્લો", hi: "गांधीनगर ज़िला" },
  Incidents: { gu: "ઘટનાઓ", hi: "घटनाएँ" },
  Model: { gu: "મોડેલ", hi: "मॉडल" },
  News: { gu: "સમાચાર", hi: "समाचार" },
  "Generate SHO brief": { gu: "SHO બ્રીફ બનાવો", hi: "SHO ब्रीफ़ बनाएँ" },
  Regenerate: { gu: "ફરી લોડ કરો", hi: "पुनः लोड करें" },
  "Generating…": { gu: "બની રહ્યું છે…", hi: "बन रहा है…" },
  "Loading district map…": {
    gu: "જિલ્લા નકશો લોડ થઈ રહ્યો છે…",
    hi: "ज़िला मानचित्र लोड हो रहा है…",
  },
  Language: { gu: "ભાષા", hi: "भाषा" },

  // --- map hint / legend ---
  "Hover a hex for details": {
    gu: "વિગત માટે હેક્સ પર હોવર કરો",
    hi: "विवरण के लिए हेक्स पर होवर करें",
  },
  "click to pin": { gu: "પિન કરવા ક્લિક કરો", hi: "पिन करने के लिए क्लिक करें" },
  "Risk · next 7 days": { gu: "જોખમ · આગામી 7 દિવસ", hi: "जोखिम · अगले 7 दिन" },
  lower: { gu: "ઓછું", hi: "कम" },
  higher: { gu: "વધુ", hi: "अधिक" },
  "top-5 priority zone": {
    gu: "ટોપ-5 પ્રાયોરિટી ઝોન",
    hi: "टॉप-5 प्राथमिकता ज़ोन",
  },

  // --- alerts panel ---
  "AI alerts · top 5 zones": {
    gu: "AI એલર્ટ્સ · ટોપ 5 ઝોન",
    hi: "AI अलर्ट · टॉप 5 ज़ोन",
  },
  "Latest news · Gandhinagar": {
    gu: "તાજા સમાચાર · ગાંધીનગર",
    hi: "ताज़ा समाचार · गांधीनगर",
  },
  Live: { gu: "લાઈવ", hi: "लाइव" },
  "View details →": { gu: "વિગતો જુઓ →", hi: "विवरण देखें →" },
  "Loading…": { gu: "લોડ થઈ રહ્યું છે…", hi: "लोड हो रहा है…" },
  "Nothing to show.": { gu: "બતાવવા કંઈ નથી.", hi: "दिखाने के लिए कुछ नहीं।" },
  Peak: { gu: "પીક", hi: "पीक" },
  live: { gu: "લાઈવ", hi: "लाइव" },
  // severity + badge types
  critical: { gu: "ગંભીર", hi: "गंभीर" },
  high: { gu: "ઊંચું", hi: "उच्च" },
  elevated: { gu: "વધેલું", hi: "बढ़ा हुआ" },
  news: { gu: "સમાચાર", hi: "समाचार" },
  event: { gu: "ઇવેન્ટ", hi: "इवेंट" },
  festival: { gu: "ઉત્સવ", hi: "त्योहार" },
  advisory: { gu: "સૂચના", hi: "सलाह" },

  // --- hover card ---
  PINNED: { gu: "પિન કરેલ", hi: "पिन किया" },
  "risk · 7d": { gu: "જોખમ · 7 દિ", hi: "जोखिम · 7दि" },
  expected: { gu: "અપેક્ષિત", hi: "अपेक्षित" },
  "Top drivers": { gu: "મુખ્ય કારણો", hi: "मुख्य कारक" },
  "Go in — full details": {
    gu: "અંદર જાઓ — સંપૂર્ણ વિગત",
    hi: "अंदर जाएँ — पूरा विवरण",
  },
  "news/event": { gu: "સમાચાર/ઇવેન્ટ", hi: "समाचार/इवेंट" },

  // --- zone detail ---
  "Incidents · 6mo": { gu: "ઘટનાઓ · 6 મહિના", hi: "घटनाएँ · 6 माह" },
  "Peak window": { gu: "પીક વિન્ડો", hi: "पीक विंडो" },
  "Top crime": { gu: "મુખ્ય ગુનો", hi: "मुख्य अपराध" },
  "Netra's rationale": { gu: "Netra નું વિશ્લેષણ", hi: "Netra का विश्लेषण" },
  "Why this zone — ranked drivers": {
    gu: "આ ઝોન કેમ — ક્રમાંકિત કારણો",
    hi: "यह ज़ोन क्यों — क्रमित कारक",
  },
  "Hour-of-day profile": {
    gu: "કલાક પ્રમાણે પ્રોફાઇલ",
    hi: "घंटे के अनुसार प्रोफ़ाइल",
  },
  "Day-of-week profile": {
    gu: "અઠવાડિયાના દિવસ પ્રમાણે",
    hi: "सप्ताह के दिन अनुसार",
  },
  "Weekly incident history": {
    gu: "સાપ્તાહિક ઘટના ઇતિહાસ",
    hi: "साप्ताहिक घटना इतिहास",
  },
  "Crime mix": { gu: "ગુના મિશ્રણ", hi: "अपराध मिश्रण" },
  "Correlated news & events": {
    gu: "સંબંધિત સમાચાર અને ઇવેન્ટ્સ",
    hi: "संबंधित समाचार और इवेंट",
  },
  augmentation: { gu: "ઓગમેન્ટેશન", hi: "ऑगमेंटेशन" },

  // --- compare tool ---
  Compare: { gu: "સરખાવો", hi: "तुलना करें" },
  "Compare zones": { gu: "ઝોન સરખાવો", hi: "ज़ोन की तुलना करें" },
  "Drag AI alerts here to compare": {
    gu: "સરખાવવા AI એલર્ટ્સ અહીં ખેંચો",
    hi: "तुलना के लिए AI अलर्ट यहाँ खींचें",
  },
  "Drag zones here to compare": {
    gu: "સરખાવવા ઝોન અહીં ખેંચો",
    hi: "तुलना के लिए ज़ोन यहाँ खींचें",
  },
  "Drag a hex from the map, or an alert · 2+": {
    gu: "નકશામાંથી હેક્સ કે એલર્ટ ખેંચો · 2+",
    hi: "मानचित्र से हेक्स या अलर्ट खींचें · 2+",
  },
  "Predictive & outcome-driven": {
    gu: "અનુમાનિત અને પરિણામ-આધારિત",
    hi: "पूर्वानुमानित और परिणाम-आधारित",
  },
  "Add to compare": { gu: "સરખાવવા ઉમેરો", hi: "तुलना में जोड़ें" },
  "Add at least 2 zones": {
    gu: "ઓછામાં ઓછા 2 ઝોન ઉમેરો",
    hi: "कम से कम 2 ज़ोन जोड़ें",
  },
  Analyze: { gu: "વિશ્લેષણ કરો", hi: "विश्लेषण करें" },
  "Analysing…": { gu: "વિશ્લેષણ થઈ રહ્યું છે…", hi: "विश्लेषण हो रहा है…" },
  "Clear all": { gu: "બધું સાફ કરો", hi: "सब हटाएँ" },
  Outlook: { gu: "અનુમાન", hi: "पूर्वानुमान" },
  "If left as-is": { gu: "જો એમ જ રહે તો", hi: "अगर ऐसे ही रहा तो" },
  "If reinforced": { gu: "જો મજબૂત કરાય તો", hi: "अगर मज़बूत किया जाए तो" },
  Recommendation: { gu: "ભલામણ", hi: "सिफ़ारिश" },
  Priority: { gu: "પ્રાયોરિટી", hi: "प्राथमिकता" },
  "AI comparison": { gu: "AI સરખામણી", hi: "AI तुलना" },
  Headline: { gu: "મુખ્ય તારણ", hi: "मुख्य निष्कर्ष" },

  // --- page chrome / brief ---
  "Zone intelligence": { gu: "ઝોન ઇન્ટેલિજન્સ", hi: "ज़ोन इंटेलिजेंस" },
  "Weekly SHO brief": { gu: "સાપ્તાહિક SHO બ્રીફ", hi: "साप्ताहिक SHO ब्रीफ़" },
  Map: { gu: "નકશો", hi: "मानचित्र" },
  "Print / PDF": { gu: "પ્રિન્ટ / PDF", hi: "प्रिंट / PDF" },
  "← Back to map": { gu: "← નકશા પર પાછા", hi: "← मानचित्र पर वापस" },
};

export function translate(key: string, lang: Lang): string {
  if (lang === "en") return key;
  return DICT[key]?.[lang] ?? key;
}

/** Hook: returns a t(key) bound to the current language. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: string) => translate(key, lang);
}
