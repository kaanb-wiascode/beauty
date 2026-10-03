"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, Button, Field, Select, TextArea, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { userErrorMessage, userLabel } from "@/lib/user-language";

type Order={id:string;status:string;totalAmount:number|string;supplierName?:string|null;supplierOrganizationName?:string|null;warehouseName:string;itemCount:number};
type OrderItem={id:string;productName:string;sku?:string|null;quantity:number|string;receivedQuantity:number|string;remainingQuantity:number|string;unitCost:number|string};
type OrderDetail={order:Order&{note?:string|null};items:OrderItem[]};
type Approval={id:string;level:number;requiredRole:string;status:string;approvedAt?:string|null};
type ApprovalState={order:{id:string;status:string;totalAmount:number|string};approvals:Approval[]};
type Receipt={id:string;purchaseOrderId:string;receivedAt:string;reversedAt?:string|null;total:number|string;itemCount:number};
type ReceiptItem={id:string;purchaseOrderItemId:string;productName:string;sku?:string|null;quantity:number|string;unitCost:number|string};
type ReceiptDetail={receipt:Receipt&{warehouseName:string;supplierName?:string|null};items:ReceiptItem[]};

const money=(v:number|string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(v||0));
const date=(v?:string|null)=>v?new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v)):"—";
const roleLabel=(v:string)=>({MANAGER:"Yönetici",FINANCE:"Finans",DIRECTOR:"Direktör"}[v]??userLabel(v));

export function ProcurementGovernanceActions(){
  const[orders,setOrders]=useState<Order[]>([]);
  const[receipts,setReceipts]=useState<Receipt[]>([]);
  const[orderId,setOrderId]=useState("");
  const[receiptId,setReceiptId]=useState("");
  const[detail,setDetail]=useState<OrderDetail|null>(null);
  const[approval,setApproval]=useState<ApprovalState|null>(null);
  const[receiptDetail,setReceiptDetail]=useState<ReceiptDetail|null>(null);
  const[receiveQty,setReceiveQty]=useState<Record<string,string>>({});
  const[returnQty,setReturnQty]=useState<Record<string,string>>({});
  const[invoiceNumber,setInvoiceNumber]=useState("");
  const[dueAt,setDueAt]=useState("");
  const[note,setNote]=useState("");
  const[reason,setReason]=useState("");
  const[busy,setBusy]=useState("");
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");

  const loadLists=useCallback(async()=>{
    try{
      const[o,r]=await Promise.all([
        api<Order[]>("/procurement/purchase-orders"),
        api<Receipt[]>("/procurement/goods-receipts"),
      ]);
      setOrders(o);setReceipts(r);
      setOrderId(current=>current||o[0]?.id||"");
      setReceiptId(current=>current||r.find(x=>!x.reversedAt)?.id||r[0]?.id||"");
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Satın alma kayıtları yüklenemedi."):"Satın alma kayıtları yüklenemedi.");}
  },[]);

  const loadOrder=useCallback(async(id:string)=>{
    if(!id){setDetail(null);setApproval(null);return;}
    try{
      const[d,a]=await Promise.all([
        api<OrderDetail>(`/procurement/purchase-orders/${id}`),
        api<ApprovalState>(`/procurement/purchase-orders/${id}/approvals`),
      ]);
      setDetail(d);setApproval(a);
      setReceiveQty(Object.fromEntries(d.items.filter(x=>Number(x.remainingQuantity)>0).map(x=>[x.id,String(Number(x.remainingQuantity))])));
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Sipariş ayrıntıları yüklenemedi."):"Sipariş ayrıntıları yüklenemedi.");}
  },[]);

  const loadReceipt=useCallback(async(id:string)=>{
    if(!id){setReceiptDetail(null);return;}
    try{
      const d=await api<ReceiptDetail>(`/procurement/goods-receipts/${id}`);
      setReceiptDetail(d);
      setReturnQty(Object.fromEntries(d.items.map(x=>[x.id,""])));
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message,"Mal kabul ayrıntıları yüklenemedi."):"Mal kabul ayrıntıları yüklenemedi.");}
  },[]);

  useEffect(()=>{void loadLists();},[loadLists]);
  useEffect(()=>{void loadOrder(orderId);},[orderId,loadOrder]);
  useEffect(()=>{void loadReceipt(receiptId);},[receiptId,loadReceipt]);

  const orderOptions=useMemo(()=>orders.map(x=>({value:x.id,label:`${x.supplierOrganizationName||x.supplierName||"Tedarikçi"} · ${x.warehouseName} · ${money(x.totalAmount)} · ${userLabel(x.status)}`})),[orders]);
  const receiptOptions=useMemo(()=>receipts.map(x=>({value:x.id,label:`${date(x.receivedAt)} · ${money(x.total)} · ${x.itemCount} kalem${x.reversedAt?" · Geri alındı":""}`})),[receipts]);

  async function mutate(path:string,body?:unknown,success="İşlem tamamlandı."){
    setBusy(path);setError("");setNotice("");
    try{
      await api(path,{method:"POST",body});
      setNotice(success);
      await loadLists();
      if(orderId)await loadOrder(orderId);
      if(receiptId)await loadReceipt(receiptId);
    }catch(e){setError(e instanceof ApiError?userErrorMessage(e.message):"İşlem tamamlanamadı.");}
    finally{setBusy("");}
  }

  async function receive(){
    if(!detail)return;
    const items=detail.items.map(x=>({purchaseOrderItemId:x.id,quantity:Number(receiveQty[x.id]||0)})).filter(x=>x.quantity>0);
    if(!items.length){setError("Teslim alınacak en az bir ürün miktarı girin.");return;}
    await mutate(`/procurement/purchase-orders/${orderId}/receive`,{
      items,invoiceNumber:invoiceNumber.trim()||undefined,dueAt:dueAt||undefined,note:note.trim()||undefined,
    },"Mal kabul kaydı oluşturuldu.");
  }

  async function reverseReceipt(){
    if(!receiptId||!reason.trim()){setError("Ters kayıt için bir neden girin.");return;}
    await mutate(`/procurement/goods-receipts/${receiptId}/reverse`,{reason:reason.trim()},"Mal kabul geri alındı.");
    setReason("");
  }

  async function partialReturn(){
    if(!receiptDetail||!reason.trim()){setError("İade nedenini girin.");return;}
    const items=receiptDetail.items.map(x=>({goodsReceiptItemId:x.id,quantity:Number(returnQty[x.id]||0)})).filter(x=>x.quantity>0);
    if(!items.length){setError("İade edilecek en az bir ürün miktarı girin.");return;}
    await mutate(`/procurement/goods-receipts/${receiptId}/partial-return`,{reason:reason.trim(),items},"Kısmi iade oluşturuldu.");
    setReason("");
  }

  return <section className="mx-auto max-w-[1500px] space-y-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
    <div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--accent)]">Satın Alma İşlemleri</p><h2 className="mt-1 text-[18px] font-semibold text-[var(--ink)]">Sipariş ve mal kabul yönetimi</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Teknik kayıt kodu girmeden siparişleri onaylayın, teslim alın ve gerektiğinde iade işlemlerini yönetin.</p></div>
    {error?<Alert onClose={()=>setError("")}>{error}</Alert>:null}
    {notice?<Alert tone="success" onClose={()=>setNotice("")}>{notice}</Alert>:null}

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Satın Alma Siparişi">
        <Field label="Sipariş"><Select value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">Sipariş seçin</option>{orderOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        {detail?<>
          <div className="grid gap-2 sm:grid-cols-3"><Mini label="Durum" value={userLabel(detail.order.status)}/><Mini label="Tedarikçi" value={detail.order.supplierOrganizationName||detail.order.supplierName||"—"}/><Mini label="Tutar" value={money(detail.order.totalAmount)}/></div>
          <div className="flex flex-wrap gap-2">
            {detail.order.status==="DRAFT"?<Button size="sm" disabled={Boolean(busy)} onClick={()=>void mutate(`/procurement/purchase-orders/${orderId}/submit-approval`,undefined,"Sipariş onaya gönderildi.")}>Onaya Gönder</Button>:null}
            {detail.order.status==="APPROVED"?<Button size="sm" disabled={Boolean(busy)} onClick={()=>void mutate(`/procurement/purchase-orders/${orderId}/order`,undefined,"Sipariş verildi.")}>Siparişi Ver</Button>:null}
          </div>
          {approval?.approvals?.length?<div className="space-y-2"><p className="text-[10px] font-semibold text-[var(--muted)]">Onay Kademeleri</p>{approval.approvals.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--surface-2)] px-3 py-2"><div><p className="text-[11px] font-semibold text-[var(--ink)]">Seviye {a.level} · {roleLabel(a.requiredRole)}</p><p className="text-[9px] text-[var(--muted)]">{userLabel(a.status)}{a.approvedAt?` · ${date(a.approvedAt)}`:""}</p></div>{a.status==="PENDING"?<div className="flex gap-2"><Button size="sm" disabled={Boolean(busy)} onClick={()=>void mutate(`/procurement/purchase-orders/${orderId}/approvals/${a.level}/approve`,undefined,"Onay kademesi onaylandı.")}>Onayla</Button><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={()=>void mutate(`/procurement/purchase-orders/${orderId}/approvals/${a.level}/reject`,undefined,"Onay kademesi reddedildi.")}>Reddet</Button></div>:null}</div>)}</div>:null}
        </>:null}
      </Panel>

      <Panel title="Siparişi Teslim Al">
        {detail?.items?.length?<div className="space-y-2">{detail.items.map(item=><div key={item.id} className="grid gap-2 rounded-[12px] border border-[var(--line)] p-3 sm:grid-cols-[1fr_130px] sm:items-center"><div><p className="text-[11px] font-semibold text-[var(--ink)]">{item.productName}</p><p className="text-[9px] text-[var(--muted)]">Kalan: {Number(item.remainingQuantity).toLocaleString("tr-TR")} · Birim maliyet: {money(item.unitCost)}</p></div><TextInput type="number" min="0" max={String(item.remainingQuantity)} step="0.001" value={receiveQty[item.id]??""} onChange={e=>setReceiveQty(x=>({...x,[item.id]:e.target.value}))} disabled={Number(item.remainingQuantity)<=0}/></div>)}</div>:<p className="text-[11px] text-[var(--muted)]">Teslim alınabilecek sipariş kalemi bulunmuyor.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Fatura Numarası"><TextInput value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)}/></Field><Field label="Vade Tarihi"><TextInput type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></Field></div>
        <Field label="Not"><TextArea rows={2} value={note} onChange={e=>setNote(e.target.value)}/></Field>
        <Button disabled={Boolean(busy)||!detail||detail.order.status!=="ORDERED"||!detail.items.some(x=>Number(x.remainingQuantity)>0)} onClick={()=>void receive()}>Mal Kabulü Oluştur</Button>
      </Panel>

      <Panel title="Mal Kabul ve İade İşlemleri">
        <Field label="Mal Kabul Kaydı"><Select value={receiptId} onChange={e=>setReceiptId(e.target.value)}><option value="">Kayıt seçin</option>{receiptOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</Select></Field>
        {receiptDetail?<div className="space-y-2">{receiptDetail.items.map(item=><div key={item.id} className="grid gap-2 rounded-[12px] border border-[var(--line)] p-3 sm:grid-cols-[1fr_130px] sm:items-center"><div><p className="text-[11px] font-semibold text-[var(--ink)]">{item.productName}</p><p className="text-[9px] text-[var(--muted)]">Teslim alınan: {Number(item.quantity).toLocaleString("tr-TR")} · {money(item.unitCost)}</p></div><TextInput type="number" min="0" max={String(item.quantity)} step="0.001" placeholder="İade miktarı" value={returnQty[item.id]??""} onChange={e=>setReturnQty(x=>({...x,[item.id]:e.target.value}))}/></div>)}</div>:null}
        <Field label="İşlem Nedeni"><TextArea rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="İade veya ters kayıt nedenini yazın"/></Field>
        <div className="flex flex-wrap gap-2"><Button disabled={Boolean(busy)||!receiptId||Boolean(receiptDetail?.receipt.reversedAt)} onClick={()=>void partialReturn()}>Seçilen Miktarları İade Et</Button><Button variant="secondary" disabled={Boolean(busy)||!receiptId||Boolean(receiptDetail?.receipt.reversedAt)} onClick={()=>void reverseReceipt()}>Mal Kabulü Geri Al</Button></div>
      </Panel>
    </div>
  </section>;
}

function Panel({title,children}:{title:string;children:React.ReactNode}){return <div className="space-y-4 rounded-[16px] border border-[var(--line)] bg-[var(--surface-2)]/25 p-4"><h3 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3>{children}</div>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-[12px] bg-[var(--surface-2)] p-3"><p className="text-[9px] text-[var(--muted)]">{label}</p><p className="mt-1 text-[11px] font-semibold text-[var(--ink)]">{value}</p></div>}
