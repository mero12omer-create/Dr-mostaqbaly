(function (root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = catalog;
  } else {
    root.SubjectCatalog = catalog;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BRANCHES = ["عام", "أزهر"];

  const CATALOG = {
    عام: {
      general: {
        label: "مواد الثانوية العامة",
        subjects: [
          { key: "arabic", label: "العربي 📖", legacyKeys: ["arabic"] },
          { key: "science", label: "العلوم المتكاملة 🔬", legacyKeys: ["science", "integrated_science"] },
          { key: "philosophy", label: "الفلسفة والمنطق 🧠", legacyKeys: ["philosophy"] },
          { key: "math", label: "الرياضيات 📐", legacyKeys: ["math"] },
          { key: "history", label: "التاريخ 📜", legacyKeys: ["history"] },
          { key: "english", label: "الإنجليزي 🔤", legacyKeys: ["english"] },
        ],
      },
    },
    أزهر: {
      religious: {
        label: "المواد الشرعية",
        subjects: [
          { key: "fiqh", label: "الفقه 📘", legacyKeys: ["fiqh"] },
          { key: "tafsir", label: "التفسير 📗", legacyKeys: ["tafsir"] },
          { key: "hadith", label: "الحديث 📙", legacyKeys: ["hadith"] },
          { key: "tawheed", label: "التوحيد 📕", legacyKeys: ["tawheed"] },
        ],
      },
      arabic: {
        label: "المواد العربية",
        subjects: [
          { key: "arabic_nahw", label: "النحو 📖", legacyKeys: ["arabic_nahw", "nahw"] },
          { key: "arabic_balagha", label: "البلاغة 📖", legacyKeys: ["arabic_balagha", "balagha"] },
          { key: "arabic_sarf", label: "الصرف 📖", legacyKeys: ["arabic_sarf", "sarf"] },
          { key: "arabic_adab", label: "الأدب 📖", legacyKeys: ["arabic_adab", "adab"] },
          { key: "arabic_nusus", label: "النصوص 📖", legacyKeys: ["arabic_nusus", "nusus"] },
        ],
      },
      cultural: {
        label: "المواد الثقافية",
        subjects: [
          { key: "science", label: "العلوم المتكاملة 🔬", legacyKeys: ["science", "integrated_science"] },
          { key: "philosophy", label: "الفلسفة والمنطق 🧠", legacyKeys: ["philosophy"] },
          { key: "math", label: "الرياضيات 📐", legacyKeys: ["math"] },
          { key: "history", label: "التاريخ 📜", legacyKeys: ["history"] },
          { key: "english", label: "الإنجليزي 🔤", legacyKeys: ["english"] },
        ],
      },
    },
  };

  const ALIASES = {
    integrated_science: "science",
    nahw: "arabic_nahw",
    balagha: "arabic_balagha",
    sarf: "arabic_sarf",
    adab: "arabic_adab",
    nusus: "arabic_nusus",
    arabic_mutalaa: "arabic_nusus",
  };

  function normalizeBranch(branch) {
    return String(branch || "").trim() === "أزهر" ? "أزهر" : "عام";
  }

  function normalizeSubjectKey(key) {
    const normalized = String(key || "").trim();
    return ALIASES[normalized] || normalized;
  }

  function getGroupsForBranch(branch) {
    const selected = CATALOG[normalizeBranch(branch)] || CATALOG.عام;
    return Object.entries(selected).map(([key, group]) => ({
      key,
      label: group.label,
      subjects: group.subjects.map((subject) => ({ ...subject })),
    }));
  }

  function getSubjectsForBranch(branch) {
    const output = {};
    getGroupsForBranch(branch).forEach((group) => {
      group.subjects.forEach((subject) => {
        output[subject.key] = subject.label;
      });
    });
    return output;
  }

  function getSubjectInfo(key, branch) {
    const normalized = normalizeSubjectKey(key);
    for (const group of getGroupsForBranch(branch)) {
      const subject = group.subjects.find((item) => item.key === normalized || item.legacyKeys.includes(String(key || "")));
      if (subject) return { ...subject, groupKey: group.key, groupLabel: group.label };
    }
    return null;
  }

  function getSubjectGroup(key, branch) {
    const info = getSubjectInfo(key, branch);
    return info ? info.groupKey : "general";
  }

  function getSubjectLabel(key, branch, fallback) {
    const info = getSubjectInfo(key, branch);
    return info ? info.label : (fallback || String(key || "مادة غير محددة"));
  }

  return {
    BRANCHES,
    CATALOG,
    ALIASES,
    normalizeBranch,
    normalizeSubjectKey,
    getGroupsForBranch,
    getSubjectsForBranch,
    getSubjectInfo,
    getSubjectGroup,
    getSubjectLabel,
  };
});
