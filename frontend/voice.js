// Voice assistant: listens (Hindi or English), turns speech into form values.
// Uses the browser's built-in Web Speech API. parse() is a pure function and is unit-tested.
(function (root) {
  const CITY_ALIASES = {
    ahmedabad: ["ahmedabad", "अहमदाबाद"],
    bengaluru: ["bengaluru", "bangalore", "बेंगलुरु", "बैंगलोर", "बेंगलोर"],
    bhopal: ["bhopal", "भोपाल"],
    chandigarh: ["chandigarh", "mohali", "चंडीगढ़", "चंडीगढ", "मोहाली"],
    chennai: ["chennai", "madras", "चेन्नई"],
    delhi: ["delhi", "दिल्ली"],
    guwahati: ["guwahati", "गुवाहाटी"],
    hyderabad: ["hyderabad", "हैदराबाद"],
    jaipur: ["jaipur", "जयपुर"],
    kochi: ["kochi", "cochin", "कोच्चि", "कोचीन"],
    kolkata: ["kolkata", "calcutta", "कोलकाता"],
    lucknow: ["lucknow", "लखनऊ"],
    ludhiana: ["ludhiana", "लुधियाना"],
    mumbai: ["mumbai", "bombay", "मुंबई"],
    patna: ["patna", "पटना"],
    pune: ["pune", "पुणे"],
  };

  const ROOF_WORDS = {
    concrete: /concrete|rcc|slab|कंक्रीट|आरसीसी|लेंटर/,
    tile: /tile|टाइल|खपरैल/,
    metal: /metal|tin|sheet|टीन|धातु|चादर|चदर/,
    asbestos: /asbestos|एस्बेस्टस/,
    thatch: /thatch|फूस|छप्पर/,
  };

  const SOIL_WORDS = {
    sandy: /sandy|sand|रेतीली|रेतीला|रेत/,
    clayey: /clayey|clay|चिकनी|काली मिट्टी/,
    loamy: /loamy|loam|दोमट/,
  };

  const AREA_RE =
    /(\d+(?:\.\d+)?)\s*(square\s*(?:meters?|metres?)|sq\.?\s*(?:m|meters?|metres?)\b|sqm|m2|m²|वर्ग\s*मीटर|square\s*(?:feet|foot)|sq\.?\s*(?:ft|feet)|sqft|वर्ग\s*फ[ीि]?ट|square\s*yards?|sq\.?\s*yd|गज)/g;

  const OPEN_WORDS = /open|ground|courtyard|garden|खुली|आंगन|जगह|बगीचा/;
  const ROOF_LABEL = /roof|terrace|छत/;

  const toLatinDigits = (s) => s.replace(/[०-९]/g, (d) => "०१२३४५६७८९".indexOf(d));

  function toSquareMetres(value, unit) {
    if (/feet|foot|ft|फ/.test(unit)) return value * 0.092903;
    if (/yard|yd|गज/.test(unit)) return value * 0.836127;
    return value;
  }

  // Returns { fields, cityId, summary }. `fields` only holds values that were heard.
  function parse(rawText) {
    const text = toLatinDigits(String(rawText || "")).toLowerCase();
    const fields = {};
    const summary = [];
    let cityId = null;

    // city
    for (const [id, names] of Object.entries(CITY_ALIASES)) {
      if (names.some((n) => text.includes(n))) {
        cityId = id;
        break;
      }
    }

    // people
    const people =
      text.match(/(\d+)\s*(?:people|persons?|members?|लोग|सदस्य|व्यक्ति)/) ||
      text.match(/family of (\d+)/);
    if (people) {
      fields.dwellers = Number(people[1]);
      summary.push(`${fields.dwellers} people`);
    }

    // areas: decide roof vs open ground from nearby words
    const matches = [...text.matchAll(AREA_RE)];
    matches.forEach((m, i) => {
      const prevEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const nextStart = i === matches.length - 1 ? text.length : matches[i + 1].index;
      const before = text.slice(prevEnd, m.index);
      const after = text.slice(m.index + m[0].length, nextStart);
      let kind = null;
      if (OPEN_WORDS.test(before)) kind = "open";
      else if (ROOF_LABEL.test(before)) kind = "roof";
      else if (OPEN_WORDS.test(after)) kind = "open";
      else if (ROOF_LABEL.test(after)) kind = "roof";
      else kind = fields.roofArea === undefined ? "roof" : "open";

      const sqm = Math.round(toSquareMetres(Number(m[1]), m[2]) * 10) / 10;
      if (kind === "open" && fields.openSpace === undefined) {
        fields.openSpace = sqm;
        summary.push(`open ground ${sqm} m²`);
      } else if (kind === "roof" && fields.roofArea === undefined) {
        fields.roofArea = sqm;
        summary.push(`roof ${sqm} m²`);
      }
    });

    for (const [type, re] of Object.entries(ROOF_WORDS)) {
      if (re.test(text)) {
        fields.roofType = type;
        summary.push(`${type} roof`);
        break;
      }
    }
    for (const [type, re] of Object.entries(SOIL_WORDS)) {
      if (re.test(text)) {
        fields.soil = type;
        summary.push(`${type} soil`);
        break;
      }
    }

    if (cityId) summary.unshift(cityId[0].toUpperCase() + cityId.slice(1));
    return { fields, cityId, summary };
  }

  // Browser wiring (skipped under Node)
  function createAssistant({ button, label, langSelect, status, onResult }) {
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SR) {
      button.disabled = true;
      status.textContent = "Voice input is not supported in this browser. Try Chrome or Edge.";
      return;
    }

    let rec = null;
    let listening = false;
    const idleLabel = label.textContent;

    function setListening(on) {
      listening = on;
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("on", on);
      label.textContent = on ? "Listening… tap to stop" : idleLabel;
    }

    button.addEventListener("click", () => {
      if (listening && rec) {
        rec.stop();
        return;
      }
      rec = new SR();
      rec.lang = langSelect.value;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (e) => {
        setListening(false);
        status.textContent =
          e.error === "not-allowed"
            ? "Microphone permission was blocked. Allow it in your browser settings."
            : e.error === "no-speech"
            ? "I did not hear anything. Please try again."
            : "Voice input failed (" + e.error + ").";
      };
      rec.onresult = (e) => {
        const heard = e.results[0][0].transcript;
        const parsed = parse(heard);
        const got = parsed.summary.length ? "Filled in: " + parsed.summary.join(", ") + "." : "I could not find any details in that.";
        status.textContent = `Heard: “${heard}”. ${got}`;
        onResult(parsed);
      };
      rec.start();
    });
  }

  const api = { parse, createAssistant, CITY_ALIASES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Voice = api;
})(typeof window !== "undefined" ? window : globalThis);
