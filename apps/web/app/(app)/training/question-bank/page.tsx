"use client";

import { useEffect, useMemo, useState } from "react";

import { DataView, DataViewMeta } from "@/components/data-view";
import { Alert, Button, Field, Spinner, TextInput } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Course = { id: string; code: string; title: string };
type Quiz = { id: string; title: string; courseId: string | null; passScore: number };
type Question = {
  id: string;
  quizId: string;
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  sortOrder: number;
};

type QuizForm = {
  courseId: string;
  title: string;
  passScore: string;
  questionCount: string;
};

type QuestionForm = {
  quizId: string;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correctIndex: string;
  points: string;
  sortOrder: string;
};

const emptyQuiz: QuizForm = { courseId: "", title: "", passScore: "70", questionCount: "10" };
const emptyQuestion: QuestionForm = {
  quizId: "", question: "", option1: "", option2: "", option3: "", option4: "", correctIndex: "0", points: "1", sortOrder: "0",
};

export default function QuestionBankPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizForm, setQuizForm] = useState<QuizForm>(emptyQuiz);
  const [questionForm, setQuestionForm] = useState<QuestionForm>(emptyQuestion);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [courseRows, quizRows] = await Promise.all([
        api<Course[]>("/training/courses"),
        api<Quiz[]>("/training/quizzes"),
      ]);
      setCourses(courseRows);
      setQuizzes(quizRows);
      setQuizForm((current) => ({ ...current, courseId: current.courseId || courseRows[0]?.id || "" }));
      setQuestionForm((current) => ({ ...current, quizId: current.quizId || quizRows[0]?.id || "" }));
      if (quizRows[0]?.id) setQuestions(await api<Question[]>(`/training/quizzes/${quizRows[0].id}/questions`));
      else setQuestions([]);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Soru Bankası Verileri Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedQuizId = questionForm.quizId;
  useEffect(() => {
    if (!selectedQuizId) { setQuestions([]); return; }
    void api<Question[]>(`/training/quizzes/${selectedQuizId}/questions`)
      .then(setQuestions)
      .catch((requestError) => setError(requestError instanceof ApiError ? requestError.message : "Sorular Yüklenemedi."));
  }, [selectedQuizId]);

  const selectedQuiz = useMemo(() => quizzes.find((quiz) => quiz.id === questionForm.quizId) ?? null, [quizzes, questionForm.quizId]);

  async function createQuiz() {
    if (!quizForm.title.trim()) { setError("Sınav Başlığı Zorunludur."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      await api("/training/quizzes", {
        method: "POST",
        body: {
          courseId: quizForm.courseId || null,
          title: quizForm.title.trim(),
          passScore: Number(quizForm.passScore || 70),
          questionCount: Number(quizForm.questionCount || 10),
        },
      });
      setMessage("Sınav Oluşturuldu.");
      setQuizForm((current) => ({ ...emptyQuiz, courseId: current.courseId }));
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Sınav Oluşturulamadı.");
    } finally { setSaving(false); }
  }

  async function createQuestion() {
    const options = [questionForm.option1, questionForm.option2, questionForm.option3, questionForm.option4].map((value) => value.trim()).filter(Boolean);
    if (!questionForm.quizId || !questionForm.question.trim() || options.length < 2) {
      setError("Sınav, Soru Metni Ve En Az İki Seçenek Gereklidir.");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/training/quizzes/${questionForm.quizId}/questions`, {
        method: "POST",
        body: {
          question: questionForm.question.trim(),
          options,
          correctIndex: Number(questionForm.correctIndex || 0),
          points: Number(questionForm.points || 1),
          sortOrder: Number(questionForm.sortOrder || 0),
        },
      });
      setMessage("Soru Eklendi.");
      setQuestionForm((current) => ({ ...emptyQuestion, quizId: current.quizId }));
      setQuestions(await api<Question[]>(`/training/quizzes/${questionForm.quizId}/questions`));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Soru Eklenemedi.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="py-16"><Spinner label="Soru Bankası Hazırlanıyor..." /></div>;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-soft)]">Eğitim Ve Yetkinlik</p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.045em] text-[var(--ink)]">Soru Bankası</h1>
        <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[var(--muted)]">Sınavları Ve Soruları Yönetin, Başarı Puanını Belirleyin Ve Eğitim Değerlendirmelerini Hazırlayın.</p>
      </header>

      {error ? <Alert onClose={() => setError("")}>{error}</Alert> : null}
      {message ? <Alert tone="success" onClose={() => setMessage("")}>{message}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">Yeni Sınav</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">Eğitime Bağlı Veya Bağımsız Bir Değerlendirme Oluşturun.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Eğitim"><select className="control h-11 w-full" value={quizForm.courseId} onChange={(event) => setQuizForm({ ...quizForm, courseId: event.target.value })}><option value="">Bağımsız Sınav</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></Field>
            <Field label="Sınav Başlığı"><TextInput value={quizForm.title} onChange={(event) => setQuizForm({ ...quizForm, title: event.target.value })} /></Field>
            <Field label="Başarı Puanı"><TextInput type="number" min="0" max="100" value={quizForm.passScore} onChange={(event) => setQuizForm({ ...quizForm, passScore: event.target.value })} /></Field>
            <Field label="Soru Sayısı"><TextInput type="number" min="1" value={quizForm.questionCount} onChange={(event) => setQuizForm({ ...quizForm, questionCount: event.target.value })} /></Field>
          </div>
          <div className="mt-5 flex justify-end"><Button disabled={saving} onClick={() => void createQuiz()}>{saving ? "Kaydediliyor..." : "Sınav Oluştur"}</Button></div>
        </section>

        <section className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">Yeni Soru</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">Seçili Sınava Çoktan Seçmeli Soru Ekleyin.</p>
          <div className="mt-5 space-y-4">
            <Field label="Sınav"><select className="control h-11 w-full" value={questionForm.quizId} onChange={(event) => setQuestionForm({ ...questionForm, quizId: event.target.value })}><option value="">Sınav Seçin</option>{quizzes.map((quiz) => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}</select></Field>
            <Field label="Soru Metni"><TextInput value={questionForm.question} onChange={(event) => setQuestionForm({ ...questionForm, question: event.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {["option1", "option2", "option3", "option4"].map((key, index) => <Field key={key} label={`${index + 1}. Seçenek`}><TextInput value={questionForm[key as keyof QuestionForm]} onChange={(event) => setQuestionForm({ ...questionForm, [key]: event.target.value })} /></Field>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Doğru Seçenek"><select className="control h-11 w-full" value={questionForm.correctIndex} onChange={(event) => setQuestionForm({ ...questionForm, correctIndex: event.target.value })}>{[0,1,2,3].map((index) => <option key={index} value={index}>{index + 1}. Seçenek</option>)}</select></Field>
              <Field label="Puan"><TextInput type="number" min="1" value={questionForm.points} onChange={(event) => setQuestionForm({ ...questionForm, points: event.target.value })} /></Field>
              <Field label="Sıra"><TextInput type="number" min="0" value={questionForm.sortOrder} onChange={(event) => setQuestionForm({ ...questionForm, sortOrder: event.target.value })} /></Field>
            </div>
          </div>
          <div className="mt-5 flex justify-end"><Button disabled={saving || !questionForm.quizId} onClick={() => void createQuestion()}>{saving ? "Kaydediliyor..." : "Soru Ekle"}</Button></div>
        </section>
      </div>

      <DataView>
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">{selectedQuiz?.title ?? "Sorular"}</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">{selectedQuiz ? `Başarı Puanı: %${selectedQuiz.passScore}` : "Sınav Seçin"}</p>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {questions.map((question, index) => (
            <article key={question.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--accent)]">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[var(--ink)]">{question.question}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {question.options.map((option, optionIndex) => <div key={optionIndex} className={`rounded-[12px] border px-3 py-2 text-[11px] ${optionIndex === question.correctIndex ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]" : "border-[var(--line)] text-[var(--muted)]"}`}>{optionIndex + 1}. {option}</div>)}
                  </div>
                  <p className="mt-3 text-[10px] text-[var(--muted-soft)]">{question.points} Puan · Sıra {question.sortOrder}</p>
                </div>
              </div>
            </article>
          ))}
          {!questions.length ? <div className="p-10 text-center text-[12px] text-[var(--muted)]">Seçili Sınav İçin Soru Bulunmuyor.</div> : null}
        </div>
        <DataViewMeta><span>{questions.length} Soru</span><span>{quizzes.length} Sınav</span></DataViewMeta>
      </DataView>
    </div>
  );
}
