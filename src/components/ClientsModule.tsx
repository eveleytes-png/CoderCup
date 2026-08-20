"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, MessageCircle, Phone, Plus, Search, Trash2, UsersRound, X } from "lucide-react";
import { deleteCustomer, loadCustomers, saveCustomer } from "@/lib/storage";
import { matchesCustomer } from "@/lib/customer-search";
import { customerActionUrl, type CustomerAction } from "@/lib/customer-actions";
import type { Customer } from "@/lib/types";

const emptyCustomer = (): Customer => ({ id: crypto.randomUUID(), legalName: "", commercialName: "", cuit: "", address: "", phone: "", whatsapp: "", email: "", contactPerson: "", notes: "" });

export function ClientsModule() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadCustomers().then(setCustomers).catch((cause) => setError(messageOf(cause))).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) { if (event.key === "Escape") setEditing(null); }
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, []);

  const visible = useMemo(() => customers.filter((customer) => matchesCustomer(customer, query)), [customers, query]);

  async function persistCustomer() {
    if (!editing) return;
    if (!editing.legalName.trim()) { setError("La razón social es obligatoria."); return; }
    setSaving(true); setError(null);
    try {
      const updated = await saveCustomer({ ...editing, legalName: editing.legalName.trim() });
      setCustomers(updated); setEditing(null); setNotice("Cliente guardado correctamente.");
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }

  async function removeCustomer() {
    if (!editing || !window.confirm(`¿Eliminar a ${editing.legalName || "este cliente"}?`)) return;
    setSaving(true); setError(null);
    try { setCustomers(await deleteCustomer(editing.id)); setEditing(null); setNotice("Cliente eliminado."); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }

  function update<K extends keyof Customer>(field: K, value: Customer[K]) { if (editing) setEditing({ ...editing, [field]: value }); }

  function runContactAction(customer: Customer, action: CustomerAction) {
    const url = customerActionUrl(customer, action);
    if (!url) return;
    const labels = { whatsapp: "abrir WhatsApp", phone: "llamar", email: "enviar un correo" };
    if (!window.confirm(`¿Querés ${labels[action]} para ${customer.legalName}?`)) return;
    if (action === "whatsapp") window.open(url, "_blank", "noopener,noreferrer");
    else window.location.assign(url);
  }

  return <section className="clients-module">
    <div className="clients-heading"><div><span className="eyebrow">AGENDA COMERCIAL</span><h1>Clientes</h1><p>Administrá tus contactos comerciales.</p></div><button className="primary" onClick={() => setEditing(emptyCustomer())}><Plus size={19}/>Nuevo cliente</button></div>
    {notice && <div className="notice success"><CheckCircle2 size={19}/>{notice}<button aria-label="Cerrar" onClick={() => setNotice(null)}><X size={17}/></button></div>}
    {error && <div className="notice error">{error}<button aria-label="Cerrar" onClick={() => setError(null)}><X size={17}/></button></div>}
    <div className="clients-card"><div className="clients-toolbar"><div><h2>Todos los clientes</h2><small>{customers.length} contacto{customers.length === 1 ? "" : "s"}</small></div><label className="search"><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Razón social, nombre o CUIT…"/></label></div>
      {loading ? <div className="empty">Cargando clientes…</div> : visible.length === 0 ? <div className="empty"><UsersRound size={44}/><h3>{customers.length ? "No encontramos coincidencias" : "Todavía no hay clientes"}</h3><p>{customers.length ? "Probá con otra búsqueda." : "Creá el primer contacto de tu agenda."}</p></div> : <div className="client-list">{visible.map((customer) => <div className="client-row" key={customer.id}><button className="client-main" onClick={() => setEditing({ ...customer })}><span className="client-avatar" style={{ backgroundColor: customerColor(customer.legalName) }}>{getInitials(customer.legalName)}</span><span><strong>{customer.legalName}</strong><small>{[customer.commercialName, customer.cuit].filter(Boolean).join(" · ") || "Sin datos adicionales"}</small></span></button><div className="client-quick-actions"><button title="WhatsApp" aria-label={`WhatsApp de ${customer.legalName}`} disabled={!customerActionUrl(customer, "whatsapp")} onClick={() => runContactAction(customer, "whatsapp")}><MessageCircle size={18}/><span>WhatsApp</span></button><button title="Llamar" aria-label={`Llamar a ${customer.legalName}`} disabled={!customerActionUrl(customer, "phone")} onClick={() => runContactAction(customer, "phone")}><Phone size={18}/><span>Llamar</span></button><button title="Enviar mail" aria-label={`Enviar mail a ${customer.legalName}`} disabled={!customerActionUrl(customer, "email")} onClick={() => runContactAction(customer, "email")}><Mail size={18}/><span>Mail</span></button></div></div>)}</div>}
    </div>

    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><section className="client-editor" onMouseDown={(event) => event.stopPropagation()}><button className="close" aria-label="Cerrar" onClick={() => setEditing(null)}><X/></button><span className="eyebrow">CLIENTE</span><h2>{customers.some((customer) => customer.id === editing.id) ? "Editar cliente" : "Nuevo cliente"}</h2>
      <div className="client-fields">
        <label>Razón social<input value={editing.legalName} onChange={(event) => update("legalName", event.target.value)}/></label>
        <label>Nombre comercial<input value={editing.commercialName} onChange={(event) => update("commercialName", event.target.value)}/></label>
        <label>CUIT<input value={editing.cuit} onChange={(event) => update("cuit", event.target.value)}/></label>
        <label className="wide">Lat/Long<input value={editing.address} onChange={(event) => update("address", event.target.value)} placeholder="-27.3621, -55.9009"/></label>
        <label>Teléfono 1<input value={editing.phone} onChange={(event) => update("phone", event.target.value)}/></label>
        <label>Teléfono 2<input value={editing.whatsapp} onChange={(event) => update("whatsapp", event.target.value)}/></label>
        <label>Mail<input type="email" value={editing.email} onChange={(event) => update("email", event.target.value)}/></label>
        <label className="wide">Observaciones<textarea rows={4} value={editing.notes} onChange={(event) => update("notes", event.target.value)}/></label>
      </div><div className="client-editor-actions">{customers.some((customer) => customer.id === editing.id) && <button className="danger" disabled={saving} onClick={removeCustomer}><Trash2 size={18}/>Eliminar</button>}<button className="primary" disabled={saving} onClick={persistCustomer}>{saving ? "Guardando…" : "Guardar cliente"}</button></div>
    </section></div>}
  </section>;
}

function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "Ocurrió un error inesperado."; }
function getInitials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "CL"; }
function customerColor(value: string) { let hash = 0; for (const character of value) hash = character.charCodeAt(0) + ((hash << 5) - hash); return `rgba(30,58,95,${(0.68 + (Math.abs(hash) % 25) / 100).toFixed(2)})`; }
