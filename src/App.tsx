import React, { useState, useEffect, useRef } from "react";
import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  Auth,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Firestore,
  Timestamp,
  orderBy,
  limit,
} from "firebase/firestore";

// تعريفات الأنواع (Interfaces)
interface MessageType {
  sender: "user" | "bot";
  text: string;
  imageUrl?: string; // رابط الصورة اختياري لرسائل الروبوت
}

interface FaqType {
  id: string; // معرف المستند من Firestore
  question: string;
  answer: string;
  imageUrl?: string;
  // إضافة timestamp لتسهيل الترتيب في Firestore
  timestamp?: Timestamp;
}

interface UnansweredQuestionType {
  id: string; // معرف المستند من Firestore
  question: string;
  timestamp: Timestamp;
  status: string;
}

interface AdminPageProps {
  db: Firestore;
  auth: Auth;
  userId: string | null;
  onLogout: () => void;
}

// ===================================================================
// إعدادات Firebase الخاصة بك - تم تحديثها لتكون ثابتة هنا
// ===================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA1BSZMoiUy8bllIUU2nqvI1y-fTaYTePU",
  authDomain: "chat-w-zeidan-db.firebaseapp.com",
  projectId: "chat-w-zeidan-db",
  storageBucket: "chat-w-zeidan-db.firebasestorage.app",
  messagingSenderId: "277437040873",
  appId: "1:277437040873:web:06de0a7b4696daee7ea0878",
  measurementId: "G-YDWFTSMTVT",
};

// هذا المتغير يستخدم لتحديد مسار البيانات في Firestore
// لا تقم بتعديله
const appId = "chat-w-zeidan-app"; // استخدام معرف فريد هنا

// هذا الرمز يستخدم للمصادقة الأولية في بيئة Canvas، لكنه لن يكون متاحاً عند النشر على Netlify.
// لذلك، سنعتمد على signInAnonymously() أو المصادقة الأخرى بعد النشر.
const initialAuthToken = null; // إبقاؤه null هنا آمن

// تهيئة Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);

// كلمة مرور بسيطة للمسؤول (للتوضيح فقط - ليست آمنة للاستخدام الحقيقي)
// ملاحظة: في بيئة الإنتاج، يجب استخدام نظام مصادقة حقيقي (مثل Firebase Authentication)
// وعدم تخزين كلمة المرور في الكود أو متغيرات البيئة الأمامية.
const ADMIN_PASSWORD: string = "adminpassword123"; // قم بتغيير هذه الكلمة!

// -------------------------------------------------------------------
// مكون صفحة الإدارة (AdminPage Component)
// -------------------------------------------------------------------
const AdminPage: React.FC<AdminPageProps> = ({
  db,
  auth,
  userId,
  onLogout,
}) => {
  const [faqs, setFaqs] = useState<FaqType[]>([]);
  const [unansweredQuestions, setUnansweredQuestions] = useState<
    UnansweredQuestionType[]
  >([]);
  const [newQuestion, setNewQuestion] = useState<string>("");
  const [newAnswer, setNewAnswer] = useState<string>("");
  const [newImageUrl, setNewImageUrl] = useState<string>("");
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  // تم تغيير نوع faqFormRef ليتوافق مع HTMLDivElement
  const faqFormRef = useRef<HTMLDivElement>(null); // مرجع لنموذج الأسئلة الشائعة

  useEffect(() => {
    if (!db || !userId) return;
    const faqsCollectionRef = collection(
      db,
      `artifacts/${appId}/users/${userId}/faqs`
    );
    // إضافة orderBy و limit لتحسين الأداء
    const q = query(faqsCollectionRef, orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const faqsList: FaqType[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<FaqType, "id">),
        }));
        setFaqs(faqsList);
      },
      (error) => {
        console.error("Error fetching FAQs:", error);
        setMessage("حدث خطأ أثناء جلب الأسئلة الشائعة.");
      }
    );
    return () => unsubscribe();
  }, [db, userId]);

  useEffect(() => {
    if (!db || !userId) return;
    const unansweredCollectionRef = collection(
      db,
      `artifacts/${appId}/users/${userId}/unanswered_questions`
    );
    // إضافة orderBy و limit لتحسين الأداء
    const q = query(
      unansweredCollectionRef,
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const questionsList: UnansweredQuestionType[] = snapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<UnansweredQuestionType, "id">),
          })
        );
        setUnansweredQuestions(questionsList);
      },
      (error) => {
        console.error("Error fetching unanswered questions:", error);
        setMessage("حدث خطأ أثناء جلب الأسئلة غير المجابة.");
      }
    );
    return () => unsubscribe();
  }, [db, userId]);

  const handleSubmitFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!newQuestion.trim() || !newAnswer.trim()) {
      setMessage("الرجاء إدخال السؤال والإجابة.");
      return;
    }
    try {
      if (editingFaqId) {
        const faqDocRef = doc(
          db,
          `artifacts/${appId}/users/${userId}/faqs`,
          editingFaqId
        );
        await updateDoc(faqDocRef, {
          question: newQuestion,
          answer: newAnswer,
          imageUrl: newImageUrl.trim(),
          timestamp: Timestamp.now(), // تحديث Timestamp عند التعديل
        });
        setMessage("تم تحديث السؤال الشائع بنجاح!");
        setEditingFaqId(null);
      } else {
        await addDoc(
          collection(db, `artifacts/${appId}/users/${userId}/faqs`),
          {
            question: newQuestion,
            answer: newAnswer,
            imageUrl: newImageUrl.trim(),
            timestamp: Timestamp.now(), // إضافة Timestamp عند الإنشاء
          }
        );
        setMessage("تمت إضافة السؤال الشائع بنجاح!");
      }
      setNewQuestion("");
      setNewAnswer("");
      setNewImageUrl("");
    } catch (error: any) {
      console.error("Error adding/updating FAQ:", error);
      let errorMessage = "حدث خطأ أثناء حفظ السؤال الشائع.";
      if (error.code) {
        errorMessage += ` (الكود: ${error.code})`;
      }
      if (
        error.message &&
        typeof error.message === "string" &&
        error.message.includes("Permission denied")
      ) {
        errorMessage =
          "ليس لديك صلاحية لحفظ البيانات. يرجى التحقق من قواعد الأمان في Firebase.";
      }
      setMessage(errorMessage);
    }
  };

  const handleEditFaq = (faq: FaqType) => {
    setEditingFaqId(faq.id);
    setNewQuestion(faq.question);
    setNewAnswer(faq.answer);
    setNewImageUrl(faq.imageUrl || "");
    setMessage("");
    // التمرير إلى النموذج عند التعديل
    faqFormRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeleteFaq = async (id: string) => {
    setMessage("");
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/faqs`, id));
      setMessage("تم حذف السؤال الشائع بنجاح!");
    } catch (error: any) {
      console.error("Error deleting FAQ:", error);
      let errorMessage = "حدث خطأ أثناء حذف السؤال الشائع.";
      if (error.code) {
        errorMessage += ` (الكود: ${error.code})`;
      }
      if (
        error.message &&
        typeof error.message === "string" &&
        error.message.includes("Permission denied")
      ) {
        errorMessage =
          "ليس لديك صلاحية لحذف البيانات. يرجى التحقق من قواعد الأمان في Firebase.";
      }
      setMessage(errorMessage);
    }
  };

  const handleDeleteUnanswered = async (id: string) => {
    setMessage("");
    try {
      await deleteDoc(
        doc(db, `artifacts/${appId}/users/${userId}/unanswered_questions`, id)
      );
      setMessage("تم حذف السؤال غير المجاب بنجاح!");
    } catch (error: any) {
      console.error("Error deleting unanswered question:", error);
      let errorMessage = "حدث خطأ أثناء حذف السؤال غير المجاب.";
      if (error.code) {
        errorMessage += ` (الكود: ${error.code})`;
      }
      if (
        error.message &&
        typeof error.message === "string" &&
        error.message.includes("Permission denied")
      ) {
        errorMessage =
          "ليس لديك صلاحية لحذف البيانات. يرجى التحقق من قواعد الأمان في Firebase.";
      }
      setMessage(errorMessage);
    }
  };

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">لوحة تحكم Chat w Zeidan</h2>
      <p className="admin-user-id">
        معرف المستخدم الخاص بك:{" "}
        <span className="admin-user-id-value">{userId}</span>
      </p>

      {message && <div className="admin-message">{message}</div>}

      <div ref={faqFormRef} className="admin-card">
        <h3 className="admin-card-title">
          {editingFaqId ? "تعديل سؤال شائع" : "إضافة سؤال شائع جديد"}
        </h3>
        <form onSubmit={handleSubmitFaq}>
          <div className="form-group">
            <label htmlFor="question" className="admin-label">
              السؤال:
            </label>
            <input
              type="text"
              id="question"
              className="admin-input"
              value={newQuestion}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewQuestion(e.target.value)
              }
              placeholder="أدخل السؤال هنا..."
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="answer" className="admin-label">
              الإجابة:
            </label>
            <textarea
              id="answer"
              className="admin-input admin-textarea"
              value={newAnswer}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNewAnswer(e.target.value)
              }
              placeholder="أدخل الإجابة هنا..."
              required
            ></textarea>
          </div>
          <div className="form-group">
            <label htmlFor="imageUrl" className="admin-label">
              رابط الصورة (اختياري):
            </label>
            <input
              type="url"
              id="imageUrl"
              className="admin-input"
              value={newImageUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setNewImageUrl(e.target.value)
              }
              placeholder="الصق رابط الصورة هنا (يجب أن يكون رابطاً مباشراً للصورة، مثال: https://example.com/image.jpg)"
            />
            <p className="admin-hint">
              ملاحظة: لا يمكن رفع الصور مباشرة، فقط روابط الصور المستضافة على
              الإنترنت التي يمكن الوصول إليها مباشرة.
            </p>
          </div>
          <div className="admin-buttons-group">
            <button type="submit" className="admin-button primary">
              {editingFaqId ? "تحديث السؤال" : "إضافة سؤال"}
            </button>
            {editingFaqId && (
              <button
                type="button"
                onClick={() => {
                  setEditingFaqId(null);
                  setNewQuestion("");
                  setNewAnswer("");
                  setNewImageUrl("");
                  setMessage("");
                }}
                className="admin-button secondary"
              >
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="admin-card">
        <h3 className="admin-card-title">
          الأسئلة الشائعة الحالية ({faqs.length})
        </h3>
        {faqs.length === 0 ? (
          <p className="admin-empty-state">
            لا توجد أسئلة شائعة حتى الآن. ابدأ بإضافة بعضها!
          </p>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-table-header">السؤال</th>
                  <th className="admin-table-header">الإجابة</th>
                  <th className="admin-table-header">الصورة</th>
                  <th className="admin-table-header">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq: FaqType) => (
                  <tr key={faq.id} className="admin-table-row">
                    <td className="admin-table-cell">{faq.question}</td>
                    <td className="admin-table-cell">{faq.answer}</td>
                    <td className="admin-table-cell-image">
                      {faq.imageUrl ? (
                        <img
                          src={faq.imageUrl}
                          alt="صورة توضيحية"
                          className="admin-image-preview"
                          onError={(
                            e: React.SyntheticEvent<HTMLImageElement, Event>
                          ) => {
                            (e.target as HTMLImageElement).src =
                              "https://placehold.co/150x100/FF0000/FFFFFF?text=خطأ+صورة";
                            (e.target as HTMLImageElement).alt =
                              "تعذر تحميل الصورة";
                          }}
                        />
                      ) : (
                        <span className="admin-empty-image">لا توجد صورة</span>
                      )}
                    </td>
                    <td className="admin-table-cell-actions">
                      <div className="admin-actions-group">
                        <button
                          onClick={() => handleEditFaq(faq)}
                          className="admin-action-button edit"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDeleteFaq(faq.id)}
                          className="admin-action-button delete"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card">
        <h3 className="admin-card-title">
          الأسئلة غير المجابة ({unansweredQuestions.length})
        </h3>
        <p className="admin-hint">
          هذه الأسئلة لم يتمكن الشات بوت من الإجابة عليها.
          <br />
          **ملاحظة هامة:** لإرسال هذه الأسئلة إلى بريدك الإلكتروني، تحتاج إلى
          إعداد خدمة خلفية (Backend Service) مثل Firebase Cloud Functions. لا
          يمكن لتطبيق المتصفح إرسال رسائل بريد إلكتروني مباشرة لأسباب أمنية.
        </p>
        {unansweredQuestions.length === 0 ? (
          <p className="admin-empty-state">
            لا توجد أسئلة غير مجابة حتى الآن. جيد!
          </p>
        ) : (
          <ul className="admin-unanswered-list">
            {unansweredQuestions.map((q: UnansweredQuestionType) => (
              <li key={q.id} className="admin-unanswered-item">
                <div className="admin-unanswered-details">
                  <p className="admin-unanswered-question">
                    السؤال: {q.question}
                  </p>
                  <p className="admin-unanswered-timestamp">
                    التاريخ:{" "}
                    {q.timestamp
                      ? q.timestamp.toDate().toLocaleString("ar-EG", {
                          dateStyle: "full",
                          timeStyle: "short",
                        })
                      : "غير متاح"}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteUnanswered(q.id)}
                  className="admin-action-button delete"
                >
                  حذف من القائمة
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-logout-container">
        <button onClick={onLogout} className="admin-logout-button">
          تسجيل الخروج من لوحة التحكم
        </button>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------
// المكون الرئيسي للتطبيق (App Component) - يحتوي على الشات بوت وصفحة الإدارة
// -------------------------------------------------------------------
const App: React.FC = () => {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [faqs, setFaqs] = useState<FaqType[]>([]);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  // حالة جديدة للتحكم في ظهور مودال تسجيل الدخول للمسؤول
  const [showAdminLoginModal, setShowAdminLoginModal] =
    useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
          // استخدام crypto.randomUUID() كبديل أكثر موثوقية
          setUserId(auth.currentUser?.uid || crypto.randomUUID());
        } catch (error) {
          console.error(
            "Error during anonymous sign-in or custom token sign-in:",
            error
          );
          // استخدام crypto.randomUUID() كبديل أكثر موثوقية
          setUserId(crypto.randomUUID());
        }
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !userId || !authReady) return;
    const faqsCollectionRef = collection(
      db,
      `artifacts/${appId}/users/${userId}/faqs`
    );
    // إضافة orderBy و limit لتحسين الأداء
    const q = query(faqsCollectionRef, orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const faqsList: FaqType[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<FaqType, "id">),
        }));
        setFaqs(faqsList);
        // تم تحديث رسالة الترحيب هنا
        if (messages.length === 0) {
          setMessages([
            { sender: "bot", text: "أهلاً بك! كيف يمكنني مساعدتك اليوم؟" },
          ]);
        }
      },
      (error) => {
        console.error("Error fetching FAQs for chatbot:", error);
      }
    );
    return () => unsubscribe();
  }, [db, userId, authReady]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (input.trim() === "") return;
    const userMessage: MessageType = { sender: "user", text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const currentSystemInstruction: string = `
                        أنت روبوت محادثة خاص بالأسئلة الشائعة (FAQs) لموقع إلكتروني.
                        مهمتك الأساسية هي الإجابة على أسئلة المستخدمين بوضوح ومساعدة، بناءً على معلومات الأسئلة الشائعة المقدمة أدناه.
                        إذا لم تتمكن من العثور على الإجابة في البيانات المقدمة، فاذكر بأدب أنك لا تستطيع العثور على المعلومات واقترح عليهم الاتصال بالدعم.
                        لا تخترع إجابات.
                        الأسئلة الشائعة المتوفرة لديك هي:
                        ${faqs
                          .map(
                            (faq) =>
                              `- سؤال: ${faq.question}\n  إجابة: ${faq.answer}`
                          )
                          .join("\n")}
                    `;

      let chatHistory = [
        {
          role: "user",
          parts: [
            { text: currentSystemInstruction + "\n\n" + userMessage.text },
          ],
        },
      ];
      const payload = { contents: chatHistory };
      // ملاحظة: مفتاح Gemini API لا يزال هنا. للحماية الكاملة، يجب استخدام خادم وسيط (API Proxy).
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyAUpObcLAy017CkzeXdA2-nwuL7n3lIvZI`; // <--- ضع مفتاح API هنا

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (
        result.candidates &&
        result.candidates.length > 0 &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0
      ) {
        const botResponseText: string =
          result.candidates[0].content.parts[0].text;
        // البحث عن السؤال الشائع المطابق بناءً على الإجابة أو السؤال
        const matchedFaq = faqs.find(
          (faq) =>
            botResponseText.includes(faq.answer) ||
            userMessage.text.includes(faq.question)
        );

        console.log("Matched FAQ:", matchedFaq); // لتصحيح الأخطاء: عرض السؤال الشائع المطابق
        console.log("Matched FAQ Image URL:", matchedFaq?.imageUrl); // لتصحيح الأخطاء: عرض رابط الصورة

        const botMessage: MessageType = {
          sender: "bot",
          text: botResponseText,
          imageUrl: matchedFaq?.imageUrl, // إضافة رابط الصورة إذا وجد
        };
        setMessages((prevMessages) => [...prevMessages, botMessage]);
      } else {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            sender: "bot",
            text: "عذراً، لم أتمكن من الحصول على رد. الرجاء المحاولة مرة أخرى.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          sender: "bot",
          text: "حدث خطأ أثناء جلب الرد. الرجاء المحاولة مرة أخرى لاحقاً.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnansweredQuestion = async (questionText: string) => {
    if (!db || !userId) {
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          sender: "bot",
          text: "لا يمكن تسجيل السؤال غير المجاب. يرجى التأكد من اتصال قاعدة البيانات.",
        },
      ]);
      return;
    }
    try {
      await addDoc(
        collection(
          db,
          `artifacts/${appId}/users/${userId}/unanswered_questions`
        ),
        {
          question: questionText,
          timestamp: Timestamp.now(), // استخدام Timestamp.now()
          status: "new",
        }
      );
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          sender: "bot",
          text: "شكراً لك! لقد قمت بتسجيل سؤالك وسنراجعه قريباً.",
        },
      ]);
    } catch (error) {
      console.error("Error adding unanswered question:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: "bot", text: "عذراً، حدث خطأ أثناء تسجيل سؤالك غير المجاب." },
      ]);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdminLoggedIn(true);
      setAdminPassword(""); // مسح كلمة المرور بعد تسجيل الدخول
      setShowAdminLoginModal(false); // إخفاء المودال بعد تسجيل الدخول
    } else {
      // استخدام رسالة داخل الواجهة بدلاً من alert()
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: "bot", text: "كلمة المرور غير صحيحة." },
      ]);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminPassword("");
    setShowAdminLoginModal(false); // إخفاء المودال عند تسجيل الخروج
  };

  // عرض صفحة الإدارة إذا كان المسؤول مسجلاً الدخول
  if (isAdminLoggedIn) {
    return (
      <AdminPage
        db={db}
        auth={auth}
        userId={userId}
        onLogout={handleAdminLogout}
      />
    );
  }

  // عرض صفحة التحميل الأولية
  if (!authReady) {
    return (
      <div className="main-container loading-screen">
        <div className="loading-content">
          <i className="fas fa-spinner fa-spin loading-icon"></i>
          <p className="loading-text">جاري تحميل الشات بوت...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-container">
      <button
        onClick={() => setShowAdminLoginModal(true)}
        className="settings-fab"
        title="لوحة التحكم"
      >
        <i className="fas fa-cog"></i>
      </button>

      <div className="chat-window">
        <div className="chat-header">
          <div className="flex-center">
            {" "}
            {/* تم تغيير flex items-center إلى flex-center */}
            <div className="avatar-icon">
              <i className="fas fa-robot"></i>
            </div>
            <div>
              <h1 className="chat-title">المساعد الذكي</h1>
              <span className="chat-status">متصل الآن</span>
            </div>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message-wrapper ${
                message.sender === "user" ? "user" : "bot"
              }`}
            >
              <div className="message-bubble">
                <p>{message.text}</p>
                {message.sender === "bot" && message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="توضيح"
                    className="message-image"
                    onError={(
                      e: React.SyntheticEvent<HTMLImageElement, Event>
                    ) => {
                      (e.target as HTMLImageElement).src =
                        "https://placehold.co/150x100/FF0000/FFFFFF?text=خطأ+صورة";
                      (e.target as HTMLImageElement).alt = "تعذر تحميل الصورة";
                    }}
                  />
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-wrapper bot">
              <div className="message-bubble typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
          {/* زر الإبلاغ عن سؤال غير مجاب يظهر بعد رسالة الروبوت إذا لم يجد إجابة */}
          {!isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1].sender === "bot" &&
            messages[messages.length - 1].text.includes(
              "لا أستطيع العثور على المعلومات"
            ) && (
              <div className="message-wrapper bot">
                <button
                  onClick={() => {
                    const lastUserMessage =
                      [...messages].reverse().find((m) => m.sender === "user")
                        ?.text || "";
                    handleUnansweredQuestion(lastUserMessage);
                  }}
                  className="report-button"
                >
                  الإبلاغ عن هذا السؤال كغير مجاب
                </button>
              </div>
            )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            className="chat-input"
            placeholder="اكتب رسالتك..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            className="send-button"
            disabled={!input.trim() || isLoading}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>

      {showAdminLoginModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="modal-title">دخول المسؤول</h2>
            <form onSubmit={handleAdminLogin}>
              <input
                type="password"
                className="modal-input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="كلمة المرور"
                required
              />
              <div className="modal-buttons-group">
                <button type="submit" className="modal-button primary">
                  دخول
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="modal-button secondary"
                >
                  إلغاء
                </button>
              </div>
              <p className="modal-hint">
                هذه الحماية للاستعراض فقط وليست آمنة للاستخدام الحقيقي.
              </p>
            </form>
          </div>
        </div>
      )}

      <style>{`
                        /* --- الخطوط والأيقونات --- */
                        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
                        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

                        :root {
                            --bg-color: #1a1a1a;
                            --primary-color: #10B981; /* أخضر مشرق */
                            --user-bubble-bg: #2d3748;
                            --bot-bubble-bg: #4a5568;
                            --text-color: #E2E8F0;
                            --text-color-muted: #A0AEC0;
                            --glass-bg: rgba(26, 26, 26, 0.6);
                            --border-color: rgba(255, 255, 255, 0.1);
                            --shadow-color: rgba(0, 0, 0, 0.37);
                        }

                        html, body, #root {
                            height: 100%;
                            margin: 0;
                            padding: 0;
                            overflow: hidden;
                        }

                        body {
                            font-family: 'Cairo', sans-serif;
                            background-color: var(--bg-color);
                            color: var(--text-color);
                        }

                        .main-container {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            padding: 2rem;
                            background: url('https://www.transparenttextures.com/patterns/cubes.png'), linear-gradient(to bottom right, #2D3748, #1A202C);
                            position: relative; /* لتمكين وضع زر الإعدادات */
                        }

                        .loading-screen {
                            background: var(--bg-color); /* خلفية داكنة لشاشة التحميل */
                        }

                        .loading-content {
                            text-align: center;
                            padding: 2rem;
                            background: var(--glass-bg);
                            border-radius: 16px;
                            border: 1px solid var(--border-color);
                            box-shadow: 0 4px 16px var(--shadow-color);
                            backdrop-filter: blur(10px);
                        }

                        .loading-icon {
                            font-size: 3rem;
                            color: var(--primary-color);
                            margin-bottom: 1rem;
                        }

                        .loading-text {
                            font-size: 1.25rem;
                            font-weight: 600;
                            color: var(--text-color);
                        }

                        .settings-fab {
                            position: fixed; top: 20px; right: 20px; width: 50px; height: 50px;
                            background-color: var(--glass-bg); color: var(--text-color);
                            border: 1px solid var(--border-color); border-radius: 50%;
                            display: flex; align-items: center; justify-content: center;
                            font-size: 20px; cursor: pointer; backdrop-filter: blur(10px);
                            transition: all 0.3s ease; z-index: 1000;
                            box-shadow: 0 4px 12px var(--shadow-color);
                        }
                        .settings-fab:hover { background-color: var(--primary-color); color: white; transform: rotate(45deg) scale(1.05); }

                        .chat-window {
                            width: 100%; max-width: 450px; height: 80vh; max-height: 700px;
                            display: flex; flex-direction: column; background: var(--glass-bg);
                            border-radius: 24px; border: 1px solid var(--border-color);
                            box-shadow: 0 8px 32px 0 var(--shadow-color); backdrop-filter: blur(15px);
                            overflow: hidden;
                        }
                        
                        .chat-header {
                            padding: 1.25rem;
                            border-bottom: 1px solid var(--border-color);
                            background-color: rgba(0,0,0,0.2); /* خلفية شبه شفافة للرأس */
                            display: flex; /* إضافة flex */
                            align-items: center; /* توسيط عمودي */
                            justify-content: flex-start; /* محاذاة لليسار */
                        }
                        .flex-center {
                            display: flex;
                            align-items: center;
                        }
                        .avatar-icon {
                            width: 48px; height: 48px; background: var(--primary-color);
                            border-radius: 50%; display: flex; align-items: center; justify-content: center;
                            font-size: 24px; color: white; margin-right: 1rem;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        }
                        .chat-title { font-size: 1.25rem; font-weight: bold; color: white; }
                        .chat-status { font-size: 0.875rem; color: var(--primary-color); }

                        .chat-messages { flex-grow: 1; padding: 1rem; overflow-y: auto; }
                        .message-wrapper { display: flex; margin-bottom: 1rem; animation: fadeIn 0.4s ease-out; }
                        .message-wrapper.user { justify-content: flex-end; }
                        .message-wrapper.bot { justify-content: flex-start; }
                        
                        .message-bubble { max-width: 80%; padding: 0.75rem 1rem; border-radius: 18px; font-size: 1rem; line-height: 1.5; }
                        .message-wrapper.user .message-bubble { background-color: var(--primary-color); color: white; border-bottom-right-radius: 4px; }
                        .message-wrapper.bot .message-bubble { background-color: var(--bot-bubble-bg); color: var(--text-color); border-bottom-left-radius: 4px; }
                        .message-image { max-width: 100%; border-radius: 12px; margin-top: 0.75rem; }
                        
                        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                        .typing-indicator {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100%;
                        }
                        .typing-indicator span {
                            height: 10px; width: 10px; background-color: var(--text-color-muted);
                            border-radius: 50%; display: inline-block; margin: 0 2px;
                            animation: bounce 1.4s infinite ease-in-out both;
                        }
                        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
                        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

                        .report-button {
                            background-color: #e53e3e; /* أحمر */
                            color: white;
                            padding: 0.5rem 1rem;
                            border-radius: 12px;
                            font-size: 0.875rem;
                            cursor: pointer;
                            transition: background-color 0.2s ease;
                            border: none;
                        }
                        .report-button:hover { background-color: #c53030; }


                        .chat-input-area { display: flex; align-items: center; padding: 1rem; border-top: 1px solid var(--border-color); }
                        .chat-input {
                            flex-grow: 1; background-color: var(--user-bubble-bg);
                            border: 1px solid var(--border-color); border-radius: 12px;
                            padding: 0.75rem 1rem; color: var(--text-color);
                            font-family: 'Cairo', sans-serif; resize: none; transition: border-color 0.2s;
                            min-height: 48px; /* لضمان ارتفاع ثابت عند سطر واحد */
                            box-sizing: border-box; /* لضمان أن padding لا يزيد العرض الكلي */
                        }
                        .chat-input:focus { outline: none; border-color: var(--primary-color); }
                        .send-button {
                            width: 48px; height: 48px; background-color: var(--primary-color);
                            border: none; border-radius: 50%; color: white;
                            font-size: 1.2rem; margin-left: 0.75rem; cursor: pointer; transition: transform 0.2s;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        }
                        .send-button:hover { transform: scale(1.1); }
                        .send-button:disabled { background-color: var(--bot-bubble-bg); cursor: not-allowed; opacity: 0.7; }

                        .modal-backdrop {
                            position: fixed; inset: 0; background-color: rgba(0,0,0,0.7);
                            display: flex; align-items: center; justify-content: center; z-index: 1001;
                        }
                        .modal-content {
                            background: var(--glass-bg); padding: 2rem; border-radius: 16px;
                            border: 1px solid var(--border-color); backdrop-filter: blur(10px);
                            width: 90%; max-width: 400px;
                            box-shadow: 0 8px 32px 0 var(--shadow-color);
                        }
                        .modal-title {
                            font-size: 1.5rem;
                            font-weight: bold;
                            color: white;
                            margin-bottom: 1.5rem;
                            text-align: center;
                        }
                        .modal-input {
                            width: 100%; padding: 0.75rem 1rem; background-color: var(--user-bubble-bg);
                            border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-color);
                            margin-bottom: 1rem;
                        }
                        .modal-input:focus { outline: none; border-color: var(--primary-color); }
                        .modal-buttons-group {
                            display: flex;
                            justify-content: space-between;
                            margin-top: 1.5rem;
                        }
                        .modal-button { padding: 0.5rem 1.5rem; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; transition: all 0.2s; }
                        .modal-button.primary { background-color: var(--primary-color); color: white; }
                        .modal-button.secondary { background-color: var(--bot-bubble-bg); color: var(--text-color); }
                        .modal-button:hover.primary { background-color: #0c8a63; }
                        .modal-button:hover.secondary { background-color: #6a7388; }
                        .modal-hint {
                            font-size: 0.75rem;
                            color: var(--text-color-muted);
                            margin-top: 1rem;
                            text-align: center;
                        }


                        /* --- شريط التمرير --- */
                        .chat-messages::-webkit-scrollbar { width: 6px; }
                        .chat-messages::-webkit-scrollbar-track { background: transparent; }
                        .chat-messages::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
                        .chat-messages::-webkit-scrollbar-thumb:hover { background: #777; }

                        /* --- صفحة الإدارة --- */
                        .admin-page {
                            background: var(--bg-color);
                            padding: 2rem;
                            min-height: 100vh;
                            color: var(--text-color); /* لون النص الافتراضي للصفحة الإدارة */
                        }
                        .admin-page-title {
                            font-size: 2.5rem;
                            font-weight: bold;
                            text-align: center;
                            color: var(--primary-color);
                            margin-bottom: 2rem;
                            text-shadow: 0 0 5px rgba(16, 185, 129, 0.5);
                        }
                        .admin-user-id {
                            text-align: center;
                            color: var(--text-color-muted);
                            margin-bottom: 1.5rem;
                            font-size: 1rem;
                        }
                        .admin-user-id-value {
                            font-family: 'monospace', monospace;
                            background-color: var(--user-bubble-bg);
                            padding: 0.25rem 0.75rem;
                            border-radius: 8px;
                            color: var(--primary-color);
                            word-break: break-all;
                        }
                        .admin-message {
                            background-color: rgba(16, 185, 129, 0.2); /* أخضر فاتح شفاف */
                            border: 1px solid var(--primary-color);
                            color: var(--primary-color);
                            padding: 0.75rem 1rem;
                            border-radius: 8px;
                            text-align: center;
                            margin-bottom: 1.5rem;
                            font-weight: 600;
                        }
                        .admin-card {
                            background: var(--glass-bg);
                            padding: 2rem;
                            border-radius: 16px;
                            border: 1px solid var(--border-color);
                            margin-bottom: 2rem;
                            box-shadow: 0 4px 16px var(--shadow-color);
                            backdrop-filter: blur(10px);
                        }
                        .admin-card-title {
                            font-size: 1.75rem;
                            font-weight: 600;
                            color: white;
                            margin-bottom: 1.5rem;
                            text-align: center;
                        }
                        .form-group {
                            margin-bottom: 1rem;
                        }
                        .admin-label {
                            color: var(--text-color-muted);
                            margin-bottom: 0.5rem;
                            display: block;
                            font-size: 0.9rem;
                            font-weight: 600;
                        }
                        .admin-input {
                            width: 100%;
                            padding: 0.75rem 1rem;
                            background-color: var(--user-bubble-bg);
                            border: 1px solid var(--border-color);
                            border-radius: 8px;
                            color: var(--text-color);
                            font-family: 'Cairo', sans-serif;
                            transition: border-color 0.2s;
                        }
                        .admin-input:focus {
                            outline: none;
                            border-color: var(--primary-color);
                        }
                        .admin-textarea {
                            min-height: 100px;
                            resize: vertical;
                        }
                        .admin-hint {
                            font-size: 0.75rem;
                            color: var(--text-color-muted);
                            margin-top: 0.5rem;
                        }
                        .admin-buttons-group {
                            display: flex;
                            justify-content: center;
                            gap: 1rem;
                            margin-top: 1.5rem;
                        }
                        .admin-button {
                            padding: 0.75rem 2rem;
                            border-radius: 8px;
                            border: none;
                            cursor: pointer;
                            font-weight: 600;
                            transition: all 0.2s;
                            font-family: 'Cairo', sans-serif;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        }
                        .admin-button.primary {
                            background-color: var(--primary-color);
                            color: white;
                        }
                        .admin-button.primary:hover {
                            background-color: #0c8a63;
                        }
                        .admin-button.secondary {
                            background-color: var(--bot-bubble-bg);
                            color: var(--text-color);
                        }
                        .admin-button.secondary:hover {
                            background-color: #6a7388;
                        }

                        .admin-empty-state {
                            text-align: center;
                            color: var(--text-color-muted);
                            font-size: 1.1rem;
                            padding: 1rem;
                        }
                        .admin-table-container {
                            overflow-x: auto; /* لجعل الجدول قابلاً للتمرير أفقياً */
                        }
                        .admin-table {
                            width: 100%;
                            border-collapse: collapse;
                            background-color: rgba(0,0,0,0.1); /* خلفية خفيفة للجدول */
                            border-radius: 8px;
                            overflow: hidden; /* لضمان أن الحدود المستديرة تطبق */
                        }
                        .admin-table-header {
                            padding: 1rem;
                            text-align: right;
                            font-size: 0.85rem;
                            font-weight: 700;
                            color: var(--primary-color);
                            text-transform: uppercase;
                            border-bottom: 1px solid var(--border-color);
                            background-color: rgba(0,0,0,0.3); /* خلفية أغمق للرؤوس */
                        }
                        .admin-table-cell {
                            padding: 1rem;
                            border-bottom: 1px solid var(--border-color);
                            color: var(--text-color);
                            font-size: 0.95rem;
                            max-width: 250px; /* لتقييد عرض الخلايا */
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                        .admin-table-cell-image {
                            padding: 1rem;
                            border-bottom: 1px solid var(--border-color);
                            text-align: center;
                        }
                        .admin-image-preview {
                            width: 60px;
                            height: 60px;
                            object-fit: cover;
                            border-radius: 8px;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                        }
                        .admin-empty-image {
                            color: var(--text-color-muted);
                            font-size: 0.75rem;
                        }
                        .admin-table-cell-actions {
                            padding: 1rem;
                            border-bottom: 1px solid var(--border-color);
                            text-align: center;
                        }
                        .admin-actions-group {
                            display: flex;
                            justify-content: center;
                            gap: 0.5rem;
                        }
                        .admin-action-button {
                            padding: 0.5rem 1rem;
                            border-radius: 6px;
                            border: none;
                            cursor: pointer;
                            font-weight: 600;
                            font-size: 0.8rem;
                            transition: all 0.2s;
                            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
                        }
                        .admin-action-button.edit {
                            background-color: #f6e05e; /* أصفر فاتح */
                            color: #333;
                        }
                        .admin-action-button.edit:hover {
                            background-color: #d6bc4a;
                        }
                        .admin-action-button.delete {
                            background-color: #e53e3e; /* أحمر */
                            color: white;
                        }
                        .admin-action-button.delete:hover {
                            background-color: #c53030;
                        }
                        .admin-table-row:nth-child(even) {
                            background-color: rgba(0,0,0,0.05); /* تظليل الصفوف الزوجية */
                        }
                        .admin-table-row:hover {
                            background-color: rgba(16, 185, 129, 0.1); /* تأثير التحويم */
                        }

                        .admin-unanswered-list {
                            list-style: none;
                            padding: 0;
                        }
                        .admin-unanswered-item {
                            background-color: rgba(0,0,0,0.1);
                            border: 1px solid var(--border-color);
                            border-radius: 12px;
                            padding: 1.25rem;
                            margin-bottom: 1rem;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        }
                        .admin-unanswered-details {
                            flex-grow: 1;
                            margin-right: 1rem;
                        }
                        .admin-unanswered-question {
                            font-weight: 600;
                            color: white;
                            margin-bottom: 0.5rem;
                        }
                        .admin-unanswered-timestamp {
                            font-size: 0.85rem;
                            color: var(--text-color-muted);
                        }
                        .admin-logout-container {
                            text-align: center;
                            margin-top: 2rem;
                        }
                        .admin-logout-button {
                            background-color: var(--bot-bubble-bg);
                            color: var(--text-color);
                            border: 1px solid var(--border-color);
                            padding: 0.75rem 2rem;
                            border-radius: 8px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.2s;
                            font-family: 'Cairo', sans-serif;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        }
                        .admin-logout-button:hover {
                            background-color: #e53e3e; /* أحمر عند التحويم */
                            color: white;
                        }

                        /* Responsive adjustments */
                        @media (max-width: 768px) {
                            .main-container {
                                padding: 1rem;
                            }
                            .chat-window {
                                max-height: calc(100vh - 40px); /* Adjust for smaller screens */
                            }
                            .settings-fab {
                                top: 10px;
                                right: 10px;
                                width: 40px;
                                height: 40px;
                                font-size: 18px;
                            }
                            .chat-header {
                                padding: 1rem;
                            }
                            .avatar-icon {
                                width: 40px;
                                height: 40px;
                                font-size: 20px;
                                margin-right: 0.75rem;
                            }
                            .chat-title {
                                font-size: 1.1rem;
                            }
                            .chat-status {
                                font-size: 0.75rem;
                            }
                            .chat-messages {
                                padding: 0.75rem;
                            }
                            .message-bubble {
                                font-size: 0.9rem;
                                padding: 0.6rem 0.9rem;
                            }
                            .chat-input-area {
                                padding: 0.75rem;
                            }
                            .chat-input {
                                padding: 0.6rem 0.9rem;
                                font-size: 0.9rem;
                            }
                            .send-button {
                                width: 40px;
                                height: 40px;
                                font-size: 1rem;
                                margin-left: 0.5rem;
                            }
                            .modal-content {
                                padding: 1.5rem;
                            }
                            .modal-title {
                                font-size: 1.25rem;
                            }
                            .modal-button {
                                padding: 0.5rem 1rem;
                                font-size: 0.9rem;
                            }
                            .admin-page {
                                padding: 1rem;
                            }
                            .admin-page-title {
                                font-size: 2rem;
                            }
                            .admin-card {
                                padding: 1.5rem;
                            }
                            .admin-card-title {
                                font-size: 1.5rem;
                            }
                            .admin-table-header, .admin-table-cell {
                                padding: 0.75rem;
                                font-size: 0.8rem;
                            }
                            .admin-action-button {
                                padding: 0.4rem 0.8rem;
                                font-size: 0.7rem;
                            }
                            .admin-unanswered-item {
                                flex-direction: column;
                                align-items: flex-start;
                            }
                            .admin-unanswered-details {
                                margin-right: 0;
                                margin-bottom: 0.5rem;
                            }
                        }
                    `}</style>
    </div>
  );
};

export default App;
