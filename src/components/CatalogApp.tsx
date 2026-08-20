"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CheckCircle2, FileText, FileUp, ImagePlus, PackageSearch, Search, Share2, Trash2, UserRound, X } from "lucide-react";
import { parseLanusPdf } from "@/lib/lanus-parser";
import { parseLanusExcel } from "@/lib/lanus-excel-parser";
import { PORCELUZ_PLASTIC_PROVIDER, PORCELUZ_PORCELAIN_PROVIDER, parsePorceluzExcel } from "@/lib/porceluz-parser";
import { loadBrokerProfile, loadProducts, loadProviders, removeManualImage, removeProviderCoverImage, resolveMissingProducts, saveBrokerProfile, saveManualImage, saveProvider, saveProviderCoverImage, setProductStatus, shareManualImage, upsertImportedProducts } from "@/lib/storage";
import { matchesProduct } from "@/lib/product-search";
import { catalogProducts, catalogProviders, downloadCatalogExcel, downloadCatalogPdf, type CatalogFormat } from "@/lib/catalog-export";
import type { BrokerProfile, Product, Provider } from "@/lib/types";
import { ClientsModule } from "./ClientsModule";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
const dollars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2 });
const importProviders = [
  { id: "lanus-alambres-sa", name: "Lanús Alambres S.A.", formats: "PDF o Excel" },
  { ...PORCELUZ_PLASTIC_PROVIDER, formats: "Excel" },
  { ...PORCELUZ_PORCELAIN_PROVIDER, formats: "Excel" },
] as const;
type ImportProviderId = typeof importProviders[number]["id"];
const providerDefaults: Provider[] = importProviders.map((provider) => ({ id: provider.id, name: provider.name, legalName: provider.name }));
const emptyProfile: BrokerProfile = { name: "", imageUrl: null, phone: "", whatsapp: "", email: "" };
type MissingDecision = "delete" | "discontinue";
type ImportSummary = { providerName: string; newProducts: number; updatedProducts: number; missingProducts: number };

export function CatalogApp() {
  const [activeSection, setActiveSection] = useState<"catalog" | "clients">("catalog");
  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<Provider[]>(providerDefaults);
  const [profile, setProfile] = useState<BrokerProfile>(emptyProfile);
  const [editingProfile, setEditingProfile] = useState<BrokerProfile | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [choosingProvider, setChoosingProvider] = useState(false);
  const [importProviderId, setImportProviderId] = useState<ImportProviderId | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFormat, setCatalogFormat] = useState<CatalogFormat>("pdf");
  const [catalogProviderIds, setCatalogProviderIds] = useState<Set<string>>(new Set(catalogProviders.map((provider) => provider.id)));
  const [generatingCatalog, setGeneratingCatalog] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerCoverFile, setProviderCoverFile] = useState<File | null>(null);
  const [providerCoverPreview, setProviderCoverPreview] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareQuery, setShareQuery] = useState("");
  const [shareTargets, setShareTargets] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [missingProducts, setMissingProducts] = useState<Product[]>([]);
  const [missingDecisions, setMissingDecisions] = useState<Record<string, MissingDecision>>({});
  const [missingReviewOpen, setMissingReviewOpen] = useState(false);
  const [resolvingMissing, setResolvingMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadProducts(), loadProviders(providerDefaults), loadBrokerProfile()]).then(([loadedProducts, loadedProviders, loadedProfile]) => { setProducts(loadedProducts); setProviders(loadedProviders); setProfile(loadedProfile); }).catch((cause) => setError(messageOf(cause))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function closeModalWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (missingReviewOpen) setMissingReviewOpen(false);
      else if (editingProfile) { setEditingProfile(null); setProfileImageFile(null); setProfileImagePreview(null); setProfileError(null); }
      else if (editingProvider) { setEditingProvider(null); setProviderCoverFile(null); setProviderCoverPreview(null); }
      else if (selected) setSelected(null);
      else if (catalogOpen) setCatalogOpen(false);
      else if (choosingProvider) setChoosingProvider(false);
    }
    window.addEventListener("keydown", closeModalWithEscape);
    return () => window.removeEventListener("keydown", closeModalWithEscape);
  }, [catalogOpen, choosingProvider, editingProfile, editingProvider, missingReviewOpen, selected]);

  const visible = useMemo(() => {
    return products.filter((product) => (providerFilter === "all" || product.providerId === providerFilter) && matchesProduct(product, query));
  }, [products, providerFilter, query]);
  const shareCandidates = useMemo(() => products
    .filter((product) => product.id !== selected?.id && matchesProduct(product, shareQuery))
    .slice(0, 40), [products, selected, shareQuery]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !importProviderId) return;
    setImporting(true); setError(null); setNotice(null); setImportSummary(null);
    try {
      const isSpreadsheet = file.name.toLowerCase().endsWith(".xlsx");
      if (importProviderId !== "lanus-alambres-sa" && !isSpreadsheet) throw new Error("Las listas de Porceluz deben importarse desde un archivo Excel (.xlsx).");
      const result = importProviderId === "lanus-alambres-sa"
        ? (isSpreadsheet ? await parseLanusExcel(file) : await parseLanusPdf(file))
        : await parsePorceluzExcel(file, importProviderId === "porceluz-plastico" ? PORCELUZ_PLASTIC_PROVIDER : PORCELUZ_PORCELAIN_PROVIDER);
      if (result.products.length === 0) throw new Error("No se encontraron filas válidas para el proveedor seleccionado.");
      await saveProvider({ id: result.products[0].providerId, name: result.products[0].providerName });
      const providerProducts = products.filter((product) => product.providerId === result.products[0].providerId);
      const existingProductIds = new Set(providerProducts.map((product) => product.id));
      const incomingProductIds = new Set(result.products.map((product) => product.id));
      const newProducts = result.products.filter((product) => !existingProductIds.has(product.id)).length;
      const updatedProducts = result.products.length - newProducts;
      const disappeared = providerProducts.filter((product) => product.status === "active" && !incomingProductIds.has(product.id));
      const saved = await upsertImportedProducts(result.products);
      setProducts(saved);
      setImportSummary({ providerName: result.products[0].providerName, newProducts, updatedProducts, missingProducts: disappeared.length });
      setMissingProducts(disappeared);
      setMissingDecisions(Object.fromEntries(disappeared.map((product) => [product.id, "discontinue"])));
      setMissingReviewOpen(disappeared.length > 0);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setImporting(false); setImportProviderId(null); }
  }

  async function confirmMissingProducts() {
    setResolvingMissing(true); setError(null);
    try {
      const updated = await resolveMissingProducts(missingDecisions);
      setProducts(updated); setMissingReviewOpen(false);
      setNotice("Las decisiones sobre los productos desaparecidos fueron guardadas.");
    } catch (cause) { setError(messageOf(cause)); }
    finally { setResolvingMissing(false); }
  }

  async function reactivateProduct() {
    if (!selected) return;
    setError(null);
    try {
      const updated = await setProductStatus(selected, "active");
      const reactivated = updated.find((product) => product.id === selected.id) ?? { ...selected, status: "active" as const };
      setProducts(updated); setSelected(reactivated); setNotice(`Producto ${selected.code} reactivado.`);
    } catch (cause) { setError(messageOf(cause)); }
  }

  function chooseImportProvider(providerId: ImportProviderId) {
    setImportProviderId(providerId);
    setChoosingProvider(false);
    window.setTimeout(() => importInput.current?.click(), 0);
  }

  async function setImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;
    setError(null);
    try {
      const updated = await saveManualImage(selected, file);
      setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
      setSelected(updated);
      setNotice(`Imagen guardada para ${updated.code}.`);
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function removeImage() {
    if (!selected) return;
    setError(null);
    try {
      const updated = await removeManualImage(selected);
      setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
      setSelected(updated); setSharing(false); setShareTargets(new Set());
      setNotice(`Imagen eliminada de ${updated.code}.`);
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function shareImage() {
    if (!selected?.imageUrl || shareTargets.size === 0) return;
    setError(null);
    try {
      const updated = await shareManualImage(selected, [...shareTargets]);
      setProducts(updated); setSharing(false); setShareTargets(new Set()); setShareQuery("");
      setNotice(`Imagen aplicada a ${shareTargets.size} productos adicionales.`);
    } catch (cause) { setError(messageOf(cause)); }
  }

  function openProduct(product: Product) {
    setSelected(product); setSharing(false); setShareQuery(""); setShareTargets(new Set());
  }

  async function generateCatalog() {
    setGeneratingCatalog(true); setError(null); setNotice(null);
    try {
      const included = catalogProducts(products, catalogProviderIds);
      if (included.length === 0) throw new Error("Seleccioná al menos un proveedor que tenga productos activos.");
      if (catalogFormat === "pdf") await downloadCatalogPdf(products, catalogProviderIds, providers, profile);
      else await downloadCatalogExcel(products, catalogProviderIds, providers, profile);
      setCatalogOpen(false);
      setNotice(`Catálogo ${catalogFormat === "pdf" ? "PDF" : "Excel"} generado con ${included.length} productos.`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setGeneratingCatalog(false); }
  }

  function openProvider(provider: Provider) {
    setEditingProvider({ ...provider, legalName: provider.legalName || provider.name });
    setProviderCoverFile(null); setProviderCoverPreview(provider.coverImageUrl ?? null);
  }

  async function saveProviderChanges() {
    if (!editingProvider) return;
    const legalName = editingProvider.legalName?.trim();
    if (!legalName) { setError("La razón social es obligatoria."); return; }
    setSavingProvider(true); setError(null);
    try {
      let updated: Provider = { ...editingProvider, name: legalName, legalName };
      await saveProvider(updated);
      if (providerCoverFile) updated = await saveProviderCoverImage(updated, providerCoverFile);
      setProviders((current) => current.map((provider) => provider.id === updated.id ? updated : provider));
      setEditingProvider(null); setProviderCoverFile(null); setProviderCoverPreview(null);
      setNotice(`Proveedor ${legalName} actualizado.`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSavingProvider(false); }
  }

  function chooseProviderCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) { setError("La portada debe ser una imagen JPG o PNG."); return; }
    setProviderCoverFile(file); setProviderCoverPreview(URL.createObjectURL(file));
  }

  async function deleteProviderCover() {
    if (!editingProvider) return;
    setSavingProvider(true); setError(null);
    try {
      const updated = await removeProviderCoverImage(editingProvider);
      setEditingProvider(updated); setProviderCoverFile(null); setProviderCoverPreview(null);
      setProviders((current) => current.map((provider) => provider.id === updated.id ? updated : provider));
      setNotice(`Portada eliminada de ${updated.legalName || updated.name}.`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSavingProvider(false); }
  }

  function openProfile() {
    setEditingProfile({ ...profile }); setProfileImageFile(null); setProfileImagePreview(profile.imageUrl); setProfileError(null);
  }

  function chooseProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) { setProfileError("La imagen debe estar en formato JPG o PNG."); return; }
    setProfileImageFile(file); setProfileImagePreview(URL.createObjectURL(file)); setProfileError(null);
  }

  async function persistProfile() {
    if (!editingProfile) return;
    setSavingProfile(true); setProfileError(null);
    try {
      const updated = await saveBrokerProfile({ ...editingProfile, name: editingProfile.name.trim(), phone: editingProfile.phone.trim(), whatsapp: editingProfile.whatsapp.trim(), email: editingProfile.email.trim() }, profileImageFile);
      setProfile(updated); setEditingProfile(null); setProfileImageFile(null); setProfileImagePreview(null);
      setNotice("Perfil del corredor guardado.");
    } catch (cause) { setProfileError(messageOf(cause)); }
    finally { setSavingProfile(false); }
  }

  return (
    <main>
      <header className="topbar">
        <div className="company-identity"><button className="company-avatar" aria-label="Abrir mi perfil" title="Mi perfil" onClick={openProfile}>{profile.imageUrl ? <img src={profile.imageUrl} alt="Logo del corredor"/> : getInitials(profile.name || "Mi empresa")}</button><strong>{profile.name || "Mi empresa"}</strong></div>
        <nav className="main-nav" aria-label="Navegación principal"><button className={activeSection === "catalog" ? "active" : ""} onClick={() => setActiveSection("catalog")}>Catálogo</button><button className={activeSection === "clients" ? "active" : ""} onClick={() => setActiveSection("clients")}>Clientes</button></nav>
        <div className="header-account"><span className="storage-status"><i/>{process.env.NEXT_PUBLIC_SUPABASE_URL ? "Nube conectada" : "Guardado en este navegador"}</span></div>
      </header>

      {activeSection === "catalog" ? <>
      <section className="hero">
        <div><span className="eyebrow">PROVEEDORES</span><h1>Todas tus listas, en un solo catálogo.</h1></div>
        <button className="primary" onClick={() => setChoosingProvider(true)} disabled={importing}>
          <FileUp size={20} />{importing ? "Procesando lista…" : products.length ? "Importar o actualizar" : "Importar una lista"}
        </button>
        <input ref={importInput} hidden type="file" accept="application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importFile} />
      </section>

      {notice && <div className="notice success"><CheckCircle2 size={19} />{notice}<button aria-label="Cerrar" onClick={() => setNotice(null)}><X size={17}/></button></div>}
      {importSummary && <div className="notice import-summary"><CheckCircle2 size={19}/><div><strong>Importación completa de {importSummary.providerName}</strong><span>Productos nuevos agregados: {importSummary.newProducts}</span><span>Productos actualizados: {importSummary.updatedProducts}</span><span>Productos que ya no aparecen en la lista: {importSummary.missingProducts}</span></div>{importSummary.missingProducts > 0 && <button className="review-link" onClick={() => setMissingReviewOpen(true)}>Revisar productos</button>}<button aria-label="Cerrar" onClick={() => setImportSummary(null)}><X size={17}/></button></div>}
      {error && <div className="notice error">{error}<button aria-label="Cerrar" onClick={() => setError(null)}><X size={17}/></button></div>}

      {missingReviewOpen && <div className="modal-backdrop" onMouseDown={() => setMissingReviewOpen(false)}><section className="missing-review" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar sin confirmar" onClick={() => setMissingReviewOpen(false)}><X/></button>
        <span className="eyebrow">REIMPORTACIÓN</span><h2>Productos que ya no aparecen en la lista</h2><p>Elegí qué hacer con cada producto. Si cerrás esta ventana sin confirmar, no se aplicará ningún cambio.</p>
        <div className="missing-list">{missingProducts.map((product) => <article key={product.id}><div><strong>{product.code}</strong><span>{product.description}</span></div><div className="missing-actions"><label><input type="radio" name={`missing-${product.id}`} checked={missingDecisions[product.id] === "delete"} onChange={() => setMissingDecisions((current) => ({ ...current, [product.id]: "delete" }))}/>Eliminar</label><label><input type="radio" name={`missing-${product.id}`} checked={missingDecisions[product.id] === "discontinue"} onChange={() => setMissingDecisions((current) => ({ ...current, [product.id]: "discontinue" }))}/>Marcar como descontinuado</label></div></article>)}</div>
        <button className="primary missing-confirm" disabled={resolvingMissing} onClick={confirmMissingProducts}>{resolvingMissing ? "Guardando…" : "Confirmar"}</button>
      </section></div>}

      {choosingProvider && <div className="modal-backdrop" onMouseDown={() => setChoosingProvider(false)}><section className="provider-picker" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar" onClick={() => setChoosingProvider(false)}><X/></button>
        <span className="eyebrow">IMPORTAR O ACTUALIZAR</span><h2>Seleccioná el proveedor</h2><p>La planilla se guardará únicamente dentro del proveedor que elijas.</p>
        <div className="provider-options">{importProviders.map((provider) => <button key={provider.id} onClick={() => chooseImportProvider(provider.id)}><Building2 size={22}/><span><strong>{provider.name}</strong><small>{provider.formats}</small></span></button>)}</div>
      </section></div>}

      <section className="providers-grid">
        {providers.map((provider) => {
          const count = products.filter((product) => product.providerId === provider.id).length;
          const lastModified = products.filter((product) => product.providerId === provider.id).reduce<string | null>((latest, product) => !latest || product.importedAt > latest ? product.importedAt : latest, null);
          const providerName = provider.legalName || provider.name;
          return <button type="button" className="provider-card" key={provider.id} onClick={() => openProvider(provider)}><div className={`provider-visual${provider.coverImageUrl ? " has-image" : ""}`}>{provider.coverImageUrl ? <img src={provider.coverImageUrl} alt=""/> : <span>{getInitials(providerName)}</span>}</div><div className="provider-copy"><small>PROVEEDOR</small><h2>{providerName}</h2>{provider.fantasyName && <p>{provider.fantasyName}</p>}<small className="provider-updated">Última actualización: {lastModified ? formatShortDate(lastModified) : "sin importaciones"}</small></div><strong>{count}<span>productos</span></strong></button>;
        })}
      </section>

      <section className="catalog">
        <div className="catalog-heading"><div><h2>Productos</h2><p>Buscá por código, descripción o proveedor.</p></div><div className="catalog-filters"><label className="provider-filter"><span>Proveedor</span><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="all">Todos los proveedores</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.legalName || provider.name}</option>)}</select></label><label className="search" aria-label="Buscar productos"><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código o descripción…"/></label></div></div>

        {loading ? <div className="empty">Cargando productos…</div> : visible.length === 0 ? (
          <div className="empty"><PackageSearch size={42}/><h3>{products.length ? "No encontramos coincidencias" : "Todavía no hay productos"}</h3><p>{products.length ? "Probá con otro código o descripción." : "Importá el PDF real de Lanús para comenzar."}</p></div>
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Precio de lista</th><th>Condiciones de pago</th><th>Imagen</th></tr></thead><tbody>
            {visible.map((product) => <tr key={product.id}>
              <td><button className="product-link" onClick={() => openProduct(product)}><strong>{product.code}</strong><span>{product.description}</span>{product.status === "discontinued" && <em className="discontinued-badge">Descontinuado</em>}<small>{product.providerName}</small></button></td>
              <td><strong>{formatPrice(product)}</strong><small>{product.priceStatus === "quote" ? "Consultar al proveedor" : `${product.currency} · sin IVA`}</small></td>
              <td><div className="discounts">{product.paymentDiscounts.map((discount) => <span key={`${discount.label}-${discount.resultingPrice}`}><b>{money.format(discount.resultingPrice)}</b>{discount.label}</span>)}</div></td>
              <td><button className="image-button" onClick={() => openProduct(product)}>{product.imageUrl ? <img src={product.imageUrl} alt=""/> : <><ImagePlus size={20}/><span>Agregar</span></>}</button></td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>

      <button className="catalog-fab" aria-label="Generar catálogo" title="Generar catálogo" onClick={() => setCatalogOpen(true)}><FileText size={27}/></button>

      {catalogOpen && <div className="modal-backdrop" onMouseDown={() => setCatalogOpen(false)}><section className="catalog-generator" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar" onClick={() => setCatalogOpen(false)}><X/></button>
        <span className="eyebrow">CATÁLOGO PARA CLIENTES</span><h2>Generar catálogo</h2>
        <fieldset><legend>Formato</legend><div className="format-options">
          <label><input type="radio" name="catalog-format" checked={catalogFormat === "pdf"} onChange={() => setCatalogFormat("pdf")}/><span><b>PDF</b><small>Catálogo comercial legible</small></span></label>
          <label><input type="radio" name="catalog-format" checked={catalogFormat === "xlsx"} onChange={() => setCatalogFormat("xlsx")}/><span><b>Excel</b><small>Para importar a otro sistema</small></span></label>
        </div></fieldset>
        <fieldset><legend>Proveedores</legend><div className="catalog-provider-options">{providers.map((provider) => {
          const count = products.filter((product) => product.providerId === provider.id && product.status === "active").length;
          return <label key={provider.id}><input type="checkbox" checked={catalogProviderIds.has(provider.id)} onChange={(event) => setCatalogProviderIds((current) => { const next = new Set(current); if (event.target.checked) next.add(provider.id); else next.delete(provider.id); return next; })}/><span><b>{provider.legalName || provider.name}</b><small>{count} productos activos</small></span></label>;
        })}</div></fieldset>
        <button className="primary generate-button" disabled={generatingCatalog || catalogProviderIds.size === 0} onClick={generateCatalog}><FileText size={19}/>{generatingCatalog ? "Generando…" : `Generar ${catalogFormat === "pdf" ? "PDF" : "Excel"}`}</button>
      </section></div>}

      {editingProvider && <div className="modal-backdrop" onMouseDown={() => setEditingProvider(null)}><section className="provider-editor" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar" onClick={() => setEditingProvider(null)}><X/></button>
        <span className="eyebrow">PROVEEDOR</span><h2>Editar datos proveedor</h2>
        <div className="provider-editor-grid"><div className="provider-fields">
          <label>Razón social<input value={editingProvider.legalName ?? ""} onChange={(event) => setEditingProvider({ ...editingProvider, legalName: event.target.value })}/></label>
          <label>Nombre de fantasía<input value={editingProvider.fantasyName ?? ""} onChange={(event) => setEditingProvider({ ...editingProvider, fantasyName: event.target.value })}/><small>Este nombre aparecerá como título en el catálogo PDF</small></label>
          <label>Contacto<input value={editingProvider.contact ?? ""} onChange={(event) => setEditingProvider({ ...editingProvider, contact: event.target.value })}/></label>
          <label>Coordenadas<input value={[editingProvider.latitude, editingProvider.longitude].filter(Boolean).join(", ")} placeholder="-27.385937, -55.915104" onChange={(event) => { const [latitude = "", longitude = ""] = event.target.value.split(",", 2); setEditingProvider({ ...editingProvider, latitude: latitude.trim(), longitude: longitude.trimStart() }); }}/><small>Pegá latitud y longitud separadas por una coma.</small></label>
          <label>Descripción<textarea rows={4} value={editingProvider.description ?? ""} onChange={(event) => setEditingProvider({ ...editingProvider, description: event.target.value })}/></label>
        </div><div className="provider-cover"><strong>Foto de portada del catálogo</strong><div className="cover-preview">{providerCoverPreview ? <img src={providerCoverPreview} alt="Previsualización de portada"/> : <><ImagePlus size={42}/><span>Sin portada</span></>}</div><div className="cover-actions"><label className="upload"><ImagePlus size={18}/>Cargar IMG<input hidden type="file" accept="image/jpeg,image/png" onChange={chooseProviderCover}/></label><button className="danger" disabled={!providerCoverPreview || savingProvider} onClick={deleteProviderCover}><Trash2 size={18}/>Eliminar</button></div></div></div>
        <button className="primary provider-save" disabled={savingProvider} onClick={saveProviderChanges}>{savingProvider ? "Guardando…" : "Guardar cambios"}</button>
      </section></div>}

      {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar" onClick={() => setSelected(null)}><X/></button>
        <div className="image-preview">{selected.imageUrl ? <img src={selected.imageUrl} alt={`Imagen de ${selected.description}`}/> : <ImagePlus size={48}/>}</div>
        <div className="modal-copy"><span className="code">CÓDIGO {selected.code}</span><h2>{selected.description}</h2><p>{selected.providerName}</p><strong className="modal-price">{formatPrice(selected)}</strong>
          {selected.status === "discontinued" && <div className="product-status"><span className="discontinued-badge">Descontinuado</span><button className="secondary" onClick={reactivateProduct}>Reactivar producto</button></div>}
          <div className="image-actions"><label className="upload"><ImagePlus size={19}/>{selected.imageUrl ? "Cambiar imagen" : "Agregar imagen"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={setImage}/></label>
          {selected.imageUrl && <><button className="secondary" onClick={() => setSharing((value) => !value)}><Share2 size={18}/>Usar en otros</button><button className="danger" onClick={removeImage}><Trash2 size={18}/>Eliminar</button></>}</div>
          <small>La imagen manual se conserva cuando vuelvas a importar la lista.</small>
          {sharing && <div className="share-panel"><h3>Usar esta imagen en otros productos</h3><label className="search compact"><Search size={17}/><input value={shareQuery} onChange={(event) => setShareQuery(event.target.value)} placeholder="Buscar código o descripción…"/></label>
            <div className="candidate-list">{shareCandidates.map((product) => <label key={product.id}><input type="checkbox" checked={shareTargets.has(product.id)} onChange={(event) => setShareTargets((current) => { const next = new Set(current); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })}/><span><b>{product.code}</b>{product.description}</span></label>)}</div>
            <button className="primary share-confirm" disabled={shareTargets.size === 0} onClick={shareImage}>Aplicar a {shareTargets.size} producto{shareTargets.size === 1 ? "" : "s"}</button>
          </div>}
        </div>
      </section></div>}
      </> : <ClientsModule/>}

      {editingProfile && <div className="modal-backdrop" onMouseDown={() => setEditingProfile(null)}><section className="profile-editor" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Cerrar" onClick={() => setEditingProfile(null)}><X/></button>
        <span className="eyebrow">CUENTA</span><h2>Mi perfil</h2>
        <div className="profile-photo"><div className="profile-photo-preview">{profileImagePreview ? <img src={profileImagePreview} alt="Previsualización del perfil"/> : <span>{editingProfile.name ? getInitials(editingProfile.name) : <UserRound size={34}/>}</span>}</div><label className="upload"><ImagePlus size={18}/>Cargar imagen<input hidden type="file" accept="image/jpeg,image/png" onChange={chooseProfileImage}/></label><small>JPG o PNG</small></div>
        <div className="profile-fields">
          <label>Nombre del corredor o nombre comercial<input value={editingProfile.name} onChange={(event) => setEditingProfile({ ...editingProfile, name: event.target.value })}/></label>
          <label>Teléfono<input type="tel" value={editingProfile.phone} onChange={(event) => setEditingProfile({ ...editingProfile, phone: event.target.value })}/></label>
          <label>WhatsApp<input type="tel" value={editingProfile.whatsapp} onChange={(event) => setEditingProfile({ ...editingProfile, whatsapp: event.target.value })}/></label>
          <label>Mail<input type="email" value={editingProfile.email} onChange={(event) => setEditingProfile({ ...editingProfile, email: event.target.value })}/></label>
        </div>
        {profileError && <p className="profile-error">{profileError}</p>}
        <button className="primary profile-save" disabled={savingProfile} onClick={persistProfile}>{savingProfile ? "Guardando…" : "Guardar"}</button>
      </section></div>}
    </main>
  );
}

function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Ocurrió un error inesperado."; }
function formatPrice(product: Product) { return product.priceStatus === "quote" ? "A cotizar" : product.currency === "USD" ? dollars.format(product.listPrice) : money.format(product.listPrice); }
function formatShortDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" }).format(date).replace(".", ""); }
function getInitials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "PR"; }
