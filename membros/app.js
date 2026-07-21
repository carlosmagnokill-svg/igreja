import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const PDF_URL =
  "https://carlosmagnokill-svg.github.io/igreja/LISTA_GERAL_MEMBROS.pdf";

const RESPONSIBLES_URL =
  "https://carlosmagnokill-svg.github.io/igreja/RESPONSAVEL_GA.xlsx";

const state = {
  members: [],
  filtered: [],
  referenceDate: "",
  responsiblesByGroup: new Map(),
};

const ui = {
  referenceDate: document.querySelector("#referenceDate"),
  totalRecords: document.querySelector("#totalRecords"),
  visibleRecords: document.querySelector("#visibleRecords"),
  activeFilterText: document.querySelector("#activeFilterText"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  tableArea: document.querySelector("#tableArea"),
  emptyState: document.querySelector("#emptyState"),
  membersBody: document.querySelector("#membersBody"),
  nameSearch: document.querySelector("#nameSearch"),
  groupFilter: document.querySelector("#groupFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sexFilter: document.querySelector("#sexFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  reloadButton: document.querySelector("#reloadButton"),
  savePdfButton: document.querySelector("#savePdfButton"),
  printDate: document.querySelector("#printDate"),
  printTime: document.querySelector("#printTime"),
  printGroup: document.querySelector("#printGroup"),
};

const collator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function formatDateTime() {
  const now = new Date();
  ui.printDate.textContent = now.toLocaleDateString("pt-BR");
  ui.printTime.textContent = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupTextItems(items, tolerance = 2.8) {
  const rows = [];

  for (const item of items) {
    const text = cleanText(item.str);
    if (!text) continue;

    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);

    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ text, x, width: item.width || 0 });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => ({
      ...row,
      items: row.items.sort((a, b) => a.x - b.x),
      text: row.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" "),
    }));
}

function findColumnAnchors(rows) {
  const header = rows.find((row) => {
    const value = normalizeText(row.text);
    return value.includes("pessoa") &&
      value.includes("grupo") &&
      value.includes("categoria") &&
      value.includes("sexo");
  });

  if (!header) return null;

  const findX = (matcher) => {
    const item = header.items.find((entry) => matcher(normalizeText(entry.text)));
    return item?.x;
  };

  const personX = findX((v) => v.includes("pessoa"));
  const situationX = findX((v) => v.includes("situacao"));
  const groupX = findX((v) => v.includes("grupo"));
  const categoryX = findX((v) => v.includes("categoria"));
  const sexX = findX((v) => v === "sexo" || v.includes("sexo"));

  if ([personX, groupX, categoryX, sexX].some((value) => value == null)) {
    return null;
  }

  return {
    personX,
    situationX: situationX ?? (personX + groupX) / 2,
    groupX,
    categoryX,
    sexX,
  };
}

function joinCell(items) {
  return cleanText(items.map((item) => item.text).join(" "));
}

function parseRowByCoordinates(row, anchors) {
  const firstItem = row.items[0];
  if (!firstItem || !/^\d+(?:\s|$)/.test(firstItem.text)) return null;

  const cells = {
    person: [],
    situation: [],
    group: [],
    category: [],
    sex: [],
  };

  for (const item of row.items) {
    if (item.x < anchors.situationX - 2) cells.person.push(item);
    else if (item.x < anchors.groupX - 2) cells.situation.push(item);
    else if (item.x < anchors.categoryX - 2) cells.group.push(item);
    else if (item.x < anchors.sexX - 2) cells.category.push(item);
    else cells.sex.push(item);
  }

  const person = joinCell(cells.person);
  const match = person.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const group = joinCell(cells.group);
  const category = joinCell(cells.category);
  const sex = joinCell(cells.sex).match(/\b[FM]\b/i)?.[0]?.toUpperCase() || "";

  if (!group || !category || !sex) return null;

  return {
    item: Number(match[1]),
    name: cleanText(match[2]),
    group,
    category,
    sex,
  };
}

function parseRowFallback(text) {
  const line = cleanText(text);
  const start = line.match(/^(\d+)\s+(.+)$/);
  if (!start) return null;

  const item = Number(start[1]);
  const body = start[2];
  const groupMatch = body.match(/\bGrupo\s+\d+\b/i);
  const sexMatch = body.match(/\s([FM])\s*$/i);
  if (!groupMatch || !sexMatch) return null;

  const group = groupMatch[0];
  const sex = sexMatch[1].toUpperCase();
  const beforeGroup = body.slice(0, groupMatch.index).trim();
  const afterGroup = body
    .slice(groupMatch.index + groupMatch[0].length, sexMatch.index)
    .trim();

  const situations = [
    "Visitante Frequente",
    "Membro não batizado",
    "Membro nao batizado",
    "Visitante",
    "Membro",
  ];

  let name = beforeGroup;
  for (const situation of situations) {
    const index = normalizeText(beforeGroup).lastIndexOf(normalizeText(situation));
    if (index > 0) {
      name = beforeGroup.slice(0, index).trim();
      break;
    }
  }

  return {
    item,
    name,
    group,
    category: afterGroup,
    sex,
  };
}

function extractReferenceDate(rows) {
  for (const row of rows) {
    const match = row.text.match(/(?:Refer[eê]ncia|Emiss[aã]o):\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (match) return match[1];
  }
  return "";
}


let xlsxLibraryPromise = null;

async function ensureXlsxLibrary() {
  if (window.XLSX) return window.XLSX;

  if (!xlsxLibraryPromise) {
    xlsxLibraryPromise = loadWithFallback(
      [
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
        "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
      ],
      () => Boolean(window.XLSX)
    ).then(() => window.XLSX).catch((error) => {
      xlsxLibraryPromise = null;
      throw error;
    });
  }

  return xlsxLibraryPromise;
}

function findHeaderKey(row, candidates) {
  const keys = Object.keys(row || {});
  return keys.find((key) => {
    const normalized = normalizeText(key);
    return candidates.some((candidate) => normalized.includes(candidate));
  });
}

function normalizeGroupKey(value = "") {
  const normalized = normalizeText(value);
  const number = normalized.match(/\d+/)?.[0];
  return number ? `grupo ${number}` : normalized;
}

async function loadResponsibles() {
  try {
    const XLSX = await ensureXlsxLibrary();
    const response = await fetch(RESPONSIBLES_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Arquivo de responsáveis retornou HTTP ${response.status}.`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    const map = new Map();

    for (const row of rows) {
      const groupKey = findHeaderKey(row, [
        "grupo",
        "grupo de assistencia",
        "ga"
      ]);

      const responsibleKey = findHeaderKey(row, [
        "responsavel",
        "nome",
        "lider"
      ]);

      if (!groupKey || !responsibleKey) continue;

      const group = cleanText(row[groupKey]);
      const responsible = cleanText(row[responsibleKey]);

      if (!group || !responsible) continue;

      map.set(normalizeGroupKey(group), responsible);
    }

    state.responsiblesByGroup = map;
    console.info(`${map.size} responsável(is) de grupo carregado(s).`);
  } catch (error) {
    console.warn("Não foi possível carregar RESPONSAVEL_GA.xlsx:", error);
    state.responsiblesByGroup = new Map();
  }
}

function getResponsibleForSelectedGroup() {
  const selectedGroup = ui.groupFilter.value;

  if (!selectedGroup) {
    return "Todos os grupos";
  }

  return state.responsiblesByGroup.get(normalizeGroupKey(selectedGroup))
    || "Não informado";
}

function getCategorySummary(members) {
  const summary = {
    total: members.length,
    child03: 0,
    child37: 0,
    intermediate711: 0,
    adolescent: 0,
    youth: 0,
    adult: 0,
    female: 0,
    male: 0,
  };

  for (const member of members) {
    const category = normalizeText(member.category);
    const sex = normalizeText(member.sex);

    if (
      category.includes("colo 0-3") ||
      category.includes("crianca de colo") ||
      category === "0-3"
    ) {
      summary.child03 += 1;
    } else if (
      category.includes("pequeno") ||
      category.includes("3-7")
    ) {
      summary.child37 += 1;
    } else if (
      category.includes("intermediario") ||
      category.includes("7-11")
    ) {
      summary.intermediate711 += 1;
    } else if (category.includes("adolescente")) {
      summary.adolescent += 1;
    } else if (category.includes("jovem")) {
      summary.youth += 1;
    } else if (category.includes("adulto")) {
      summary.adult += 1;
    }

    if (sex === "f" || sex.includes("feminino")) summary.female += 1;
    if (sex === "m" || sex.includes("masculino")) summary.male += 1;
  }

  return summary;
}

async function readPdf() {
  setLoading(true);

  try {
    const responsiblesPromise = loadResponsibles();
    const loadingTask = pdfjsLib.getDocument({
      url: PDF_URL,
      cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/cmaps/",
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    const collected = [];
    let referenceDate = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const rows = groupTextItems(content.items);
      const anchors = findColumnAnchors(rows);

      if (!referenceDate) referenceDate = extractReferenceDate(rows);

      for (const row of rows) {
        const parsed =
          (anchors && parseRowByCoordinates(row, anchors)) ||
          parseRowFallback(row.text);

        if (parsed) collected.push(parsed);
      }
    }

    const deduplicated = Array.from(
      new Map(collected.map((member) => [member.item, member])).values()
    ).sort((a, b) => a.item - b.item);

    if (!deduplicated.length) {
      throw new Error("O PDF foi aberto, mas nenhuma linha de membro foi reconhecida.");
    }

    await responsiblesPromise;

    state.members = deduplicated;
    state.referenceDate = referenceDate;
    ui.referenceDate.textContent = referenceDate || "não informada";
    ui.totalRecords.textContent = String(deduplicated.length);

    buildFilters();
    applyFilters();
    setLoading(false);
  } catch (error) {
    console.error(error);
    setError(
      `${error.message || "Erro desconhecido"} Verifique a conexão, o endereço do PDF e as permissões CORS do GitHub Pages.`
    );
  }
}

function setLoading(isLoading) {
  ui.loadingState.hidden = !isLoading;
  ui.errorState.hidden = true;
  ui.tableArea.hidden = isLoading;
}

function setError(message) {
  ui.loadingState.hidden = true;
  ui.tableArea.hidden = true;
  ui.errorState.hidden = false;
  ui.errorMessage.textContent = message;
}

function fillSelect(select, values, allLabel) {
  select.innerHTML = `<option value="">${allLabel}</option>`;

  values
    .filter(Boolean)
    .sort(collator.compare)
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
}

function buildFilters() {
  fillSelect(
    ui.groupFilter,
    [...new Set(state.members.map((member) => member.group))],
    "Todos"
  );
  fillSelect(
    ui.categoryFilter,
    [...new Set(state.members.map((member) => member.category))],
    "Todas"
  );
  fillSelect(
    ui.sexFilter,
    [...new Set(state.members.map((member) => member.sex))],
    "Todos"
  );
}

function applyFilters() {
  const search = normalizeText(ui.nameSearch.value);
  const group = ui.groupFilter.value;
  const category = ui.categoryFilter.value;
  const sex = ui.sexFilter.value;

  state.filtered = state.members.filter((member) => {
    const matchesName = !search || normalizeText(member.name).includes(search);
    const matchesGroup = !group || member.group === group;
    const matchesCategory = !category || member.category === category;
    const matchesSex = !sex || member.sex === sex;
    return matchesName && matchesGroup && matchesCategory && matchesSex;
  });

  renderTable();
  const groupLabel = group || "todos";
  ui.activeFilterText.textContent = `Grupo: ${groupLabel}`;
  ui.printGroup.textContent = group || "Todos";
}

function renderTable() {
  ui.membersBody.replaceChildren();

  const fragment = document.createDocumentFragment();

  state.filtered.forEach((member, index) => {
    const row = document.createElement("tr");

    const cells = [
      index + 1,
      member.name,
      member.group,
      member.category,
      member.sex,
    ];

    cells.forEach((value, cellIndex) => {
      const cell = document.createElement("td");

      if (cellIndex >= 2) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = value;
        cell.appendChild(badge);
      } else {
        cell.textContent = value;
      }

      row.appendChild(cell);
    });

    fragment.appendChild(row);
  });

  ui.membersBody.appendChild(fragment);
  ui.visibleRecords.textContent = String(state.filtered.length);
  ui.emptyState.hidden = state.filtered.length > 0;
  ui.tableArea.hidden = false;
  formatDateTime();
}

function clearFilters() {
  ui.nameSearch.value = "";
  ui.groupFilter.value = "";
  ui.categoryFilter.value = "";
  ui.sexFilter.value = "";
  applyFilters();
  ui.nameSearch.focus();
}

let searchTimer;
ui.nameSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 160);
});

[ui.groupFilter, ui.categoryFilter, ui.sexFilter].forEach((select) => {
  select.addEventListener("change", applyFilters);
});

ui.clearFilters.addEventListener("click", clearFilters);
ui.reloadButton.addEventListener("click", readPdf);

let pdfLibrariesPromise = null;

function loadExternalScript(url) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdf-lib="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.pdfLib = url;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
    document.head.appendChild(script);
  });
}

async function loadWithFallback(urls, validator) {
  let lastError;

  for (const url of urls) {
    try {
      await loadExternalScript(url);
      if (validator()) return;
    } catch (error) {
      lastError = error;
      console.warn(error);
    }
  }

  throw lastError || new Error("Biblioteca externa indisponível.");
}

async function ensurePdfLibraries() {
  if (window.jspdf?.jsPDF && window.jspdf.jsPDF.API?.autoTable) return;

  if (!pdfLibrariesPromise) {
    pdfLibrariesPromise = (async () => {
      await loadWithFallback(
        [
          "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
          "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
        ],
        () => Boolean(window.jspdf?.jsPDF)
      );

      await loadWithFallback(
        [
          "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
          "https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js"
        ],
        () => Boolean(window.jspdf?.jsPDF?.API?.autoTable)
      );
    })().catch((error) => {
      pdfLibrariesPromise = null;
      throw error;
    });
  }

  return pdfLibrariesPromise;
}

function sanitizeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function savePdfReport() {
  const button = ui.savePdfButton;
  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = "Preparando PDF...";
    await ensurePdfLibraries();
  } catch (error) {
    console.error(error);
    alert("Não foi possível carregar o gerador de PDF. Verifique sua conexão com a internet e tente novamente.");
    button.disabled = false;
    button.textContent = originalText;
    return;
  }

  if (!state.filtered.length) {
    alert("Não há registros para gerar o PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const now = new Date();
  const reportDate = now.toLocaleDateString("pt-BR");
  const reportTime = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const selectedGroup = ui.groupFilter.value || "Todos";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(130, 0, 8);
  doc.text("Relatório Geral de Membros", 14, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 33, 59);
  doc.text("Fonte: SGI - ICM", 14, 24);

  doc.setFontSize(9);
  doc.text(`Data: ${reportDate}`, 196, 12, { align: "right" });
  doc.text(`Hora: ${reportTime}`, 196, 17, { align: "right" });
  doc.text(`Grupo: ${selectedGroup}`, 196, 22, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    `Responsável do Grupo: ${getResponsibleForSelectedGroup()}`,
    14,
    29
  );

  doc.setDrawColor(169, 14, 24);
  doc.setLineWidth(1);
  doc.line(14, 33, 196, 33);

  const body = state.filtered.map((member, index) => [
    index + 1,
    member.name,
    member.group,
    member.category,
    member.sex,
  ]);

  doc.autoTable({
    startY: 37,
    head: [["It.", "Nome", "Grupo", "Categoria", "Sexo"]],
    body,
    theme: "grid",
    margin: { left: 14, right: 14, bottom: 14 },
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      cellPadding: 2.2,
      lineColor: [220, 226, 232],
      lineWidth: 0.2,
      textColor: [20, 33, 59],
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 244, 247],
      textColor: [20, 33, 59],
      fontStyle: "bold",
      lineColor: [220, 226, 232],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 11, halign: "center", fontStyle: "bold", textColor: [130, 0, 8] },
      1: { cellWidth: 75, fontStyle: "bold" },
      2: { cellWidth: 27 },
      3: { cellWidth: 49 },
      4: { cellWidth: 20, halign: "center" },
    },
    didDrawPage: (data) => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(104, 117, 138);
      doc.text(
        `Página ${pageCount}`,
        196,
        289,
        { align: "right" }
      );
    },
  });


  const summary = getCategorySummary(state.filtered);
  let summaryY = doc.lastAutoTable.finalY + 8;

  if (summaryY > 238) {
    doc.addPage("a4", "portrait");
    summaryY = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(130, 0, 8);
  doc.text("Resumo do Relatório", 14, summaryY);

  doc.autoTable({
    startY: summaryY + 4,
    theme: "grid",
    margin: { left: 14, right: 14 },
    body: [
      ["Quantidade total:", summary.total],
      ["Qtd. Crianças 0-3:", summary.child03],
      ["Qtd. Crianças 3-7:", summary.child37],
      ["Qtd. Intermediários 7-11:", summary.intermediate711],
      ["Qtd. de Adolescentes:", summary.adolescent],
      ["Qtd. de Jovens:", summary.youth],
      ["Qtd. de Adultos:", summary.adult],
      ["Quantidade Feminino:", summary.female],
      ["Quantidade Masculino:", summary.male],
    ],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [220, 226, 232],
      lineWidth: 0.2,
      textColor: [20, 33, 59],
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: 25, halign: "center", fontStyle: "bold" },
    },
  });


  const totalPages = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(104, 117, 138);
    doc.text(
      `Página ${pageNumber}/${totalPages}`,
      196,
      289,
      { align: "right" }
    );
  }

  const fileGroup = sanitizeFileName(selectedGroup);
  const fileName = `Relatorio_Geral_Membros_${fileGroup}_${reportDate.replaceAll("/", "-")}.pdf`;
  doc.save(fileName);
  button.disabled = false;
  button.textContent = originalText;
}

ui.savePdfButton.addEventListener("click", savePdfReport);

readPdf();
