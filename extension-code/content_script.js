(() => {
  const PLATFORM_HOSTS = [
    { match: /linkedin\.com/i, name: "linkedin" },
    { match: /glassdoor\.com/i, name: "glassdoor" },
    { match: /(?:^|\.)(greenhouse\.io|boards\.greenhouse\.io)/i, name: "greenhouse" },
    { match: /lever\.co/i, name: "lever" },
    { match: /myworkdayjobs\.com/i, name: "workday" },
    { match: /workday/i, name: "workday" }
  ];

  const safeText = (value) => (value || "").toString().trim();

  const normalizeWhitespace = (text) =>
    safeText(text)
      .replace(/\s+/g, " ")
      .trim();

  const stripHtml = (html) => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return normalizeWhitespace(div.textContent || "");
  };

  const detectPlatform = (urlString) => {
    try {
      const host = new URL(urlString).hostname;
      const found = PLATFORM_HOSTS.find((p) => p.match.test(host));
      return found ? found.name : "other";
    } catch (e) {
      return "other";
    }
  };

  const sanitizeBlockString = (str, limit) => {
    const normalized = normalizeWhitespace(str);
    return normalized.length > limit ? normalized.slice(0, limit) : normalized;
  };

  const collectMetaTexts = () => {
    const keys = [
      "description",
      "og:description",
      "twitter:description",
      "og:title",
      "title"
    ];
    const contents = [];
    keys.forEach((key) => {
      const meta =
        document.querySelector(`meta[name="${key}"]`) ||
        document.querySelector(`meta[property="${key}"]`);
      if (meta && meta.content) {
        contents.push(meta.content);
      }
    });
    if (document.title) contents.push(document.title);
    return contents.map(normalizeWhitespace).filter(Boolean);
  };

  const parseCompanyLocationFromText = (text) => {
    if (!text) return { company: "", location: "" };
    // Try to capture "Title at Company in Location" shapes
    const atMatch = text.match(/\bat\s+([^,\n|]{2,80})/i);
    const inMatch = text.match(/\bin\s+([^|\n]{2,120})/i);
    const company = atMatch ? atMatch[1].trim() : "";
    const location = inMatch ? inMatch[1].replace(/[\.\)]$/, "").trim() : "";
    return { company, location };
  };

  const extractFromMeta = () => {
    const contents = collectMetaTexts();
    for (const entry of contents) {
      const { company, location } = parseCompanyLocationFromText(entry);
      if (company || location) {
        return { company, location };
      }
    }
    return { company: "", location: "" };
  };

  const findJobPostingJsonLd = () => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    );
    const jobEntries = [];
    scripts.forEach((scriptEl) => {
      try {
        const parsed = JSON.parse(scriptEl.textContent);
        collectJobPostings(parsed, jobEntries);
      } catch (e) {
        // ignore malformed JSON-LD
      }
    });
    return jobEntries;
  };

  const collectJobPostings = (node, bucket) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => collectJobPostings(item, bucket));
      return;
    }
    if (typeof node === "object") {
      const typeField = node["@type"] || node.type;
      const typeList = Array.isArray(typeField) ? typeField : [typeField];
      if (typeList.some((t) => typeof t === "string" && /JobPosting/i.test(t))) {
        bucket.push(node);
      }
      if (Array.isArray(node["@graph"])) {
        collectJobPostings(node["@graph"], bucket);
      }
    }
  };

  const parseJsonLdJob = (jobNode) => {
    const pick = (value) => (Array.isArray(value) ? value[0] : value);
    const cleanAddressPart = (value) => {
      if (!value) return "";
      if (typeof value === "string") return value;
      if (typeof value === "object") {
        return (
          value.name ||
          value.addressLocality ||
          value.addressRegion ||
          value.addressCountry ||
          value.text ||
          ""
        );
      }
      return "";
    };

    const title = safeText(jobNode.title || jobNode.name);
    const descriptionRaw = jobNode.description || jobNode.responsibilities;
    const description_text = stripHtml(descriptionRaw);
    const hiringOrgNode = pick(jobNode.hiringOrganization) || pick(jobNode.employer);
    const hiringOrg =
      (hiringOrgNode && (hiringOrgNode.name || hiringOrgNode.legalName)) ||
      jobNode.company ||
      "";

    const jobLocationNode = pick(jobNode.jobLocation);
    const addressNode = jobLocationNode && pick(jobLocationNode.address);
    const locationParts = [];
    if (addressNode) {
      locationParts.push(cleanAddressPart(addressNode.streetAddress));
      locationParts.push(cleanAddressPart(addressNode.addressLocality));
      locationParts.push(cleanAddressPart(addressNode.addressRegion));
      locationParts.push(cleanAddressPart(addressNode.addressCountry));
    }
    const location = normalizeWhitespace(locationParts.filter(Boolean).join(", "));
    const employment_type =
      (Array.isArray(jobNode.employmentType)
        ? jobNode.employmentType[0]
        : jobNode.employmentType) || "";
    const seniority =
      (Array.isArray(jobNode.seniorityLevel)
        ? jobNode.seniorityLevel[0]
        : jobNode.seniorityLevel) || "";

    const requirements = [];
    const nice_to_have = [];
    const reqFields = [
      jobNode.qualifications,
      jobNode.skills,
      jobNode.educationRequirements,
      jobNode.experienceRequirements
    ];
    reqFields.forEach((field) => {
      if (Array.isArray(field)) {
        field.forEach((item) => {
          const t = stripHtml(item);
          if (t) requirements.push(t);
        });
      } else if (field) {
        const t = stripHtml(field);
        if (t) requirements.push(t);
      }
    });
    const preferred = jobNode.preferredQualifications || jobNode.niceToHave;
    if (Array.isArray(preferred)) {
      preferred.forEach((item) => {
        const t = stripHtml(item);
        if (t) nice_to_have.push(t);
      });
    } else if (preferred) {
      const t = stripHtml(preferred);
      if (t) nice_to_have.push(t);
    }

    return {
      title,
      description_text,
      company: safeText(hiringOrg),
      location: safeText(location),
      employment_type: safeText(employment_type),
      seniority: safeText(seniority),
      requirements,
      nice_to_have
    };
  };

  const runReadabilityExtraction = () => {
    try {
      const cloned = document.cloneNode(true);
      cloned.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
      const article = new Readability(cloned).parse();
      if (!article) return null;
      return {
        title: safeText(article.title),
        description_text: normalizeWhitespace(article.textContent || ""),
        text_length: (article.textContent || "").length
      };
    } catch (e) {
      return null;
    }
  };

  const computeTopBlocks = () => {
    const candidates = Array.from(
      document.querySelectorAll("main, article, section, div")
    );
    const blocks = [];
    candidates.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (["nav", "footer", "header", "aside"].includes(tag)) return;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const text = sanitizeBlockString(el.innerText || "", 4000);
      if (text.length < 200) return;
      const textLength = text.length;
      const textDensityFactor = textLength / (el.childElementCount + 1 || 1);
      const score = textLength * textDensityFactor;
      blocks.push({
        el,
        score,
        tag,
        id: el.id || "",
        className: sanitizeBlockString(el.className || "", 160),
        text
      });
    });
    blocks.sort((a, b) => b.score - a.score);
    return blocks.slice(0, 10).map((b, idx) => ({
      rank: idx + 1,
      tag: b.tag,
      id: b.id,
      class: b.className,
      text: b.text
    }));
  };

  const buildConfidence = (extraction) => {
    let confidence = 0.2; // Baseline prior
    if (
      extraction.debug.jsonld_found &&
      extraction.job.title &&
      extraction.job.description_text
    ) {
      confidence += 0.4; // JSON-LD is strong signal
    }
    if (extraction.debug.readability_text_length > 1200) {
      confidence += 0.25; // Long readable text boosts confidence
    }
    if (extraction.job.title.length >= 6 && extraction.job.title.length <= 120) {
      confidence += 0.1; // Titles outside this range are likely noisy
    }
    if (extraction.job.company) {
      confidence += 0.05;
    }
    if (extraction.job.location) {
      confidence += 0.05;
    }
    return Math.min(1, Math.max(0, confidence));
  };

  const extractJobData = (includeDebug) => {
    const url = location.href;
    const platform = detectPlatform(url);
    const debug = {
      jsonld_found: false,
      jsonld_raw: null,
      readability_title: "",
      readability_text_length: 0,
      top_blocks: []
    };

    let job = {
      title: "",
      company: "",
      location: "",
      employment_type: "",
      seniority: "",
      description_text: "",
      requirements: [],
      nice_to_have: []
    };
    let extraction_method = "top_blocks";
    let usedReadability = false;
    let usedTopBlocks = false;

    const jsonLdJobs = findJobPostingJsonLd();
    if (jsonLdJobs.length) {
      debug.jsonld_found = true;
      const parsedJob = parseJsonLdJob(jsonLdJobs[0]);
      if (includeDebug) {
        debug.jsonld_raw = jsonLdJobs[0];
      }
      if (parsedJob.title || parsedJob.description_text) {
        job = { ...job, ...parsedJob };
        extraction_method = "jsonld";
      }
    }

    if (!job.description_text || !job.title) {
      const readabilityResult = runReadabilityExtraction();
      if (readabilityResult && readabilityResult.description_text) {
        job.description_text = job.description_text || readabilityResult.description_text;
        if (!job.title) job.title = readabilityResult.title || job.title;
        debug.readability_title = readabilityResult.title || "";
        debug.readability_text_length = readabilityResult.text_length || 0;
        usedReadability = true;
        if (!job.company || !job.location) {
          const metaGuesses = extractFromMeta();
          if (!job.company && metaGuesses.company) {
            job.company = metaGuesses.company;
          }
          if (!job.location && metaGuesses.location) {
            job.location = metaGuesses.location;
          }
        }
      }
    }

    const top_blocks = computeTopBlocks();
    debug.top_blocks = includeDebug ? top_blocks : top_blocks.slice(0, 3);
    if ((!job.description_text || job.description_text.length < 200) && top_blocks.length) {
      job.description_text = job.description_text || top_blocks.map((b) => b.text).join("\n\n");
      if (extraction_method === "top_blocks" && !job.title && top_blocks.length) {
        job.title = top_blocks[0].text.slice(0, 120);
      }
      usedTopBlocks = true;
    }

    if (usedReadability) {
      extraction_method = "readability";
    } else if (usedTopBlocks) {
      extraction_method = "top_blocks";
    }

    const meta = {
      version: "0.1",
      timestamp_iso: new Date().toISOString(),
      url,
      platform,
      extraction_method,
      confidence: 0,
      user_tags: [],
      notes: ""
    };

    const extraction = { meta, job, debug };
    extraction.meta.confidence = buildConfidence(extraction);
    return extraction;
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "extract_job") {
      try {
        const data = extractJobData(Boolean(message.includeDebug));
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return true;
    }
    if (message && message.type === "ping") {
      sendResponse({ ok: true });
      return false;
    }
    return undefined;
  });
})();
