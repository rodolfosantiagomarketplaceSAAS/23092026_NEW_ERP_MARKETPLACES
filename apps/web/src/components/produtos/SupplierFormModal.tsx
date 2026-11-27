"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Loader2,
  MapPin,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";
import type { ErpSupplier, ErpSupplierType } from "@/types/erp-products";

interface SupplierFormModalProps {
  open: boolean;
  supplier?: ErpSupplier | null;
  onClose: () => void;
  onSaved: (saved: ErpSupplier) => void;
}

export function SupplierFormModal({
  open,
  supplier,
  onClose,
  onSaved,
}: SupplierFormModalProps) {
  const [code, setCode] = useState("");
  const [supplierType, setSupplierType] = useState<ErpSupplierType>("distribuidor");
  const [tradeName, setTradeName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [financialEmail, setFinancialEmail] = useState("");
  const [website, setWebsite] = useState("");

  const [zipCode, setZipCode] = useState("");
  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [lookingUpCep, setLookingUpCep] = useState(false);

  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [minOrderValue, setMinOrderValue] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (supplier) {
      setCode(supplier.code);
      setSupplierType(supplier.supplier_type || "fornecedor");
      setTradeName(supplier.trade_name);
      setLegalName(supplier.legal_name || "");
      setDocumentNumber(supplier.document_number || "");
      setStateRegistration(supplier.state_registration || "");
      setLogoUrl(supplier.logo_url || "");
      setContactName(supplier.contact_name || "");
      setPhone(supplier.phone || "");
      setWhatsapp(supplier.whatsapp || "");
      setEmail(supplier.email || "");
      setFinancialEmail(supplier.financial_email || "");
      setWebsite(supplier.website || "");
      setZipCode(supplier.zip_code || "");
      setStreet(supplier.street || "");
      setStreetNumber(supplier.street_number || "");
      setComplement(supplier.complement || "");
      setNeighborhood(supplier.neighborhood || "");
      setCity(supplier.city || "");
      setStateUf(supplier.state || "");
      setPaymentTerms(supplier.payment_terms || "");
      setLeadTimeDays(
        supplier.lead_time_days !== null && supplier.lead_time_days !== undefined
          ? String(supplier.lead_time_days)
          : ""
      );
      setMinOrderValue(
        supplier.min_order_value !== null && supplier.min_order_value !== undefined
          ? String(supplier.min_order_value)
          : ""
      );
      setPixKey(supplier.pix_key || "");
      setNotes(supplier.notes || "");
      setActive(supplier.active);
    } else {
      setCode(`FOR-${Math.floor(100 + Math.random() * 900)}`);
      setSupplierType("distribuidor");
      setTradeName("");
      setLegalName("");
      setDocumentNumber("");
      setStateRegistration("");
      setLogoUrl("");
      setContactName("");
      setPhone("");
      setWhatsapp("");
      setEmail("");
      setFinancialEmail("");
      setWebsite("");
      setZipCode("");
      setStreet("");
      setStreetNumber("");
      setComplement("");
      setNeighborhood("");
      setCity("");
      setStateUf("");
      setPaymentTerms("");
      setLeadTimeDays("");
      setMinOrderValue("");
      setPixKey("");
      setNotes("");
      setActive(true);
    }
  }, [open, supplier]);

  if (!open) return null;

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/erp/products/upload-photo", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao enviar logo.");
      }
      setLogoUrl(data.photo.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar logo.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleCepLookup() {
    const clean = zipCode.replace(/\D/g, "");
    if (clean.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos para buscar o endereço.");
      return;
    }
    setLookingUpCep(true);
    setError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        setError("CEP não encontrado na base dos Correios.");
      } else {
        setStreet(data.logradouro || street);
        setNeighborhood(data.bairro || neighborhood);
        setCity(data.localidade || city);
        setStateUf(data.uf || stateUf);
      }
    } catch {
      setError("Não foi possível consultar o CEP agora. Preencha manualmente.");
    } finally {
      setLookingUpCep(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: supplier?.id,
          code,
          supplier_type: supplierType,
          trade_name: tradeName,
          legal_name: legalName || null,
          document_number: documentNumber || null,
          state_registration: stateRegistration || null,
          logo_url: logoUrl || null,
          contact_name: contactName || null,
          phone: phone || null,
          whatsapp: whatsapp || null,
          email: email || null,
          financial_email: financialEmail || null,
          website: website || null,
          zip_code: zipCode || null,
          street: street || null,
          street_number: streetNumber || null,
          complement: complement || null,
          neighborhood: neighborhood || null,
          city: city || null,
          state: stateUf || null,
          payment_terms: paymentTerms || null,
          lead_time_days: leadTimeDays !== "" ? Number(leadTimeDays) : null,
          min_order_value: minOrderValue !== "" ? Number(minOrderValue) : null,
          pix_key: pixKey || null,
          notes: notes || null,
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao salvar fornecedor.");
      }
      onSaved(data.supplier as ErpSupplier);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[93vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {supplier ? `Editar Fornecedor: ${supplier.trade_name}` : "Novo Fornecedor / Fabricante"}
              </h2>
              <p className="text-xs text-slate-500">
                Cadastre distribuidores, fabricantes e fornecedores para vincular aos produtos e bobinas PPF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Logo + Identificação */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                onClick={() => logoInputRef.current?.click()}
                className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-500 bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer relative group"
                title="Clique para enviar logo do fornecedor"
              >
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                  className="hidden"
                />
                {uploadingLogo ? (
                  <Loader2 className="w-5 h-5 animate-spin text-sky-600" />
                ) : logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={tradeName || "Logo"}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-400 group-hover:text-sky-600 text-[10px] font-semibold text-center px-1">
                    <Upload className="w-4 h-4 mb-1" />
                    Logo / Marca
                  </div>
                )}
              </div>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="text-[10px] text-rose-600 hover:underline font-semibold"
                >
                  Remover logo
                </button>
              )}
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="FOR-001"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                <select
                  value={supplierType}
                  onChange={(e) => setSupplierType(e.target.value as ErpSupplierType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="distribuidor">Distribuidor</option>
                  <option value="fabricante">Fabricante</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="importador">Importador</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="Ex: R5 SC Distribuidora"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-semibold"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Razão Social
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Ex: Brasil Film Comércio e Distribuição de Películas Ltda"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Fiscal & Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">CNPJ / CPF</label>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Inscrição Estadual
              </label>
              <input
                type="text"
                value={stateRegistration}
                onChange={(e) => setStateRegistration(e.target.value)}
                placeholder="ISENTO ou número"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telefone / Fone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(48) 99118-7573"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(48) 99118-7573"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail Comercial
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendas@fornecedor.com.br"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail Financeiro
              </label>
              <input
                type="email"
                value={financialEmail}
                onChange={(e) => setFinancialEmail(e.target.value)}
                placeholder="financeiro@r5sc.com.br"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vendedor / Contato
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nome do representante"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Endereço completo com ViaCEP */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <MapPin className="w-3.5 h-3.5 text-sky-600" />
              Endereço do Fornecedor / Fabricante
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">CEP</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="88.111-340"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCepLookup}
                    disabled={lookingUpCep}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 inline-flex items-center gap-1"
                    title="Buscar endereço pelo CEP"
                  >
                    {lookingUpCep ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    CEP
                  </button>
                </div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Rua / Logradouro
                </label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Rua Antenor Valentin da Silva"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Número</label>
                <input
                  type="text"
                  value={streetNumber}
                  onChange={(e) => setStreetNumber(e.target.value)}
                  placeholder="1267"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bairro</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Ipiranga"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cidade</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São José"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                  placeholder="SC"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white uppercase text-center font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Compl.</label>
                <input
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Galpão 2"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* Condições comerciais */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prazo Pagamento
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: PIX / 30 dias"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prazo Entrega (dias)
              </label>
              <input
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="Ex: 3"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pedido Mínimo (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chave PIX</label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CNPJ ou e-mail"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Site / Catálogo</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Descontos, política de troca, frete CIF/FOB..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Fornecedor ativo
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {supplier ? "Salvar Fornecedor" : "Cadastrar Fornecedor"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
