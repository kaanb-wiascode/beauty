"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FinanceEmpty, FinanceMetric, FinancePanel } from "@/components/finance-view";
import { Alert, Button, Select, Spinner, TextArea, TextInput } from "@/components/ui";
import { api, ApiError, withQuery } from "@/lib/api";

type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
type QuestionStatus = "DRAFT" | "PUBLISHED" | "RETIRED";
type BankQuestion = {
  id: string;
  code: string;
  version: number;
  status: QuestionStatus;
  category: string;
  questionType: QuestionType;
  prompt: string;
  options?: unknown;
  correctAnswer: unknown;
  defaultPoints: number;
  tags: string[];
  publishedAt?: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Tek Seçim",
  MULTIPLE_CHOICE: "Çoklu Seçim",
  TRUE_FALSE: "Doğru / Yanlış",
};

function pretty(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function statusTone(status: QuestionStatus) {
  if (status === "PUBLISHED") return "bg-[var(--success-soft)] text-[var(--success)]";
  if (status === "DRAFT") return "bg-[var(--warning-soft)] text-[var(--warning)]";
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [code, setCode] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [questionType, setQuestionType] = useState<QuestionType>("SINGLE_CHOICE");
  const [prompt, setPrompt] = useState("");
  const [optionsText, setOptionsText] = useState('["A","B"]');
  const [answerText, setAnswerText] = useState('"A"');
  const [points, setPoints] = useState("1");
  const [tagsText, setTagsText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api<BankQuestion[]>(withQuery("/training/lms/question-bank", { status: status || undefined, limit: 250 }));
      setQuestions(rows ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Soru bankası yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    total: questions.length,
    draft: questions.filter((item) => item.status === "DRAFT").length,
    published: questions.filter((item) => item.status === "PUBLISHED").length,
    categories: new Set(questions.map((item) => item.category)).size,
  }), [questions]);

  const createQuestion = useCallback(async () => {
    setError("");
    setSuccess("");
    if (!code.trim() || !prompt.trim()) {
      setError("Soru kodu ve soru metni zorunludur.");
      return;
    }
    const numericPoints = Number(points);
    if (!Number.isFinite(numericPoints) || numericPoints <= 0) {
      setError("Puan sıfırdan büyük olmalı.");
      return;
    }
    let options: unknown = null;
    let correctAnswer: unknown;
    try {
      options = optionsText.trim() ? JSON.parse(optionsText) : null;
      correctAnswer = JSON.parse(answerText);
    } catch {
      setError("Seçenekler ve doğru cevap geçerli JSON olmalı.");
      return;
    }
    setSaving(true);
    try {
      await api("/training/lms/question-bank", {
        method: "POST",
        body: {
          code: code.trim(),
          category: category.trim() || "GENERAL",
          questionType,
          prompt: prompt.trim(),
          options,
          correctAnswer,
          defaultPoints: numericPoints,
          tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
        },
      });
      setSuccess("Yeni soru bankası versiyonu DRAFT olarak oluşturuldu.");
      setPrompt("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Soru oluşturulamadı.");
    } finally {
      setSaving(false);
    }
  }, [answerText, category, code, load, optionsText, points, prompt, questionType, tagsText]);

  const publish = useCallback(async (id: string) => {
    setPublishingId(id);
    setError("");
    setSuccess("");
    try {
      await api(`/training/lms/question-bank/${id}/publish`, { method: "POST" });
      setSuccess("Soru versiyonu yayınlandı. Aynı kodun önceki published versiyonu retired durumuna alındı.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Soru yayınlanamadı.");
    } finally {
      setPublishingId(null);
    }
  }, [load]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">LMS Authoring</p>
          <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Reusable Question Bank</h1>
          <p className="mt-2 max-w-[840px] text-[13px] leading-6 text-[var(--muted)]">Tekrar kullanılabilir, versioned sınav soruları oluşturun. Published bank sorusu bir draft exam'a eklendiğinde soru içeriği sınava snapshot olarak kopyalanır; sonraki revizyonlar geçmiş sınavı değiştirmez.</p>
        </div>
        <div className="flex gap-2">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tüm durumlar</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="RETIRED">Retired</option>
          </Select>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Yenile</Button>
        </div>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess("")}>{success}</Alert> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric label="Toplam Versiyon" value={stats.total} detail="Yüklü soru versiyonları" tone="info" />
        <FinanceMetric label="Draft" value={stats.draft} detail="Düzenleme/yayın bekliyor" tone={stats.draft ? "warning" : "neutral"} />
        <FinanceMetric label="Published" value={stats.published} detail="Exam authoring için kullanılabilir" tone="success" />
        <FinanceMetric label="Kategori" value={stats.categories} detail="Aktif filtre kapsamı" tone="neutral" />
      </section>

      <FinancePanel title="Yeni Soru Versiyonu" description="Aynı soru koduyla yeni kayıt oluşturmak otomatik olarak bir sonraki version numarasını üretir.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Soru Kodu</span><TextInput value={code} onChange={(event) => setCode(event.target.value)} placeholder="HYGIENE-001" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Kategori</span><TextInput value={category} onChange={(event) => setCategory(event.target.value)} placeholder="HYGIENE" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Soru Tipi</span><Select value={questionType} onChange={(event) => setQuestionType(event.target.value as QuestionType)}><option value="SINGLE_CHOICE">Tek Seçim</option><option value="MULTIPLE_CHOICE">Çoklu Seçim</option><option value="TRUE_FALSE">Doğru / Yanlış</option></Select></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Varsayılan Puan</span><TextInput type="number" min={0.01} step="0.01" value={points} onChange={(event) => setPoints(event.target.value)} /></label>
          <label className="block lg:col-span-2"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Soru Metni</span><TextArea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Soru metnini yazın..." /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Seçenekler (JSON)</span><TextArea rows={5} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} placeholder='["A","B","C"]' /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Doğru Cevap (JSON)</span><TextArea rows={5} value={answerText} onChange={(event) => setAnswerText(event.target.value)} placeholder='"A" veya ["A","C"]' /></label>
          <label className="block lg:col-span-2"><span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">Etiketler</span><TextInput value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="hijyen, sterilizasyon, temel" /></label>
        </div>
        <div className="mt-4 flex justify-end"><Button disabled={saving} onClick={() => void createQuestion()}>{saving ? "Oluşturuluyor..." : "Draft Soru Oluştur"}</Button></div>
      </FinancePanel>

      <FinancePanel title="Soru Bankası" description="Correct answer yalnız training.manage kapsamındaki authoring ekranında gösterilir.">
        {loading ? <div className="flex min-h-[220px] items-center justify-center"><Spinner label="Soru bankası yükleniyor..." /></div> : questions.length ? (
          <div className="space-y-3">
            {questions.map((item) => (
              <article key={item.id} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${statusTone(item.status)}`}>{item.status}</span>
                      <span className="text-[10px] font-semibold text-[var(--accent)]">{item.code} · v{item.version}</span>
                      <span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] text-[var(--muted)]">{item.category}</span>
                    </div>
                    <h3 className="mt-3 text-[13px] font-semibold leading-6 text-[var(--ink)]">{item.prompt}</h3>
                    <div className="mt-3 grid gap-2 text-[10px] text-[var(--muted)] sm:grid-cols-2">
                      <p>Tip: <strong className="text-[var(--ink)]">{TYPE_LABELS[item.questionType]}</strong></p>
                      <p>Puan: <strong className="text-[var(--ink)]">{item.defaultPoints}</strong></p>
                      <p>Seçenekler: <span className="text-[var(--ink)]">{pretty(item.options)}</span></p>
                      <p>Doğru cevap: <span className="font-semibold text-[var(--ink)]">{pretty(item.correctAnswer)}</span></p>
                    </div>
                    {item.tags?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] text-[var(--muted)]">{tag}</span>)}</div> : null}
                  </div>
                  {item.status === "DRAFT" ? <Button disabled={publishingId !== null} onClick={() => void publish(item.id)}>{publishingId === item.id ? "Yayınlanıyor..." : "Publish"}</Button> : null}
                </div>
              </article>
            ))}
          </div>
        ) : <FinanceEmpty title="Soru bulunamadı" description="Filtre kapsamında soru bankası kaydı yok." />}
      </FinancePanel>
    </div>
  );
}
