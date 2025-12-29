function labelProjectLink(link) {
  const lower = link.toLowerCase();
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("arxiv.org") || lower.includes("doi.org")) return "Paper";
  if (lower.includes("demo") || lower.includes("app")) return "Demo";
  return "Link";
}

function buildProjectLine(name, links) {
  const renderedLinks = (links || []).map(
    (link) => `\\href{${link}}{${labelProjectLink(link)}}`
  );
  return `${name} --- ${renderedLinks.join(" --- ")}`;
}

const withLinks = buildProjectLine("Project Alpha", [
  "https://github.com/janedoe/project-alpha",
  "https://alpha-demo.com",
]);

if (!withLinks.includes("\\href{https://github.com/janedoe/project-alpha}{GitHub}")) {
  console.error("[FAIL] Expected GitHub href in LaTeX line.");
  process.exit(1);
}

const withoutLinks = buildProjectLine("Project Beta", []);
if (withoutLinks.includes("GitHub:") || withoutLinks.includes("Demo:")) {
  console.error("[FAIL] Expected no link labels when links are missing.");
  process.exit(1);
}

console.log("[PASS] LaTeX link label assertions succeeded.");
