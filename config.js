// إعدادات الواجهة. بعد نشر Apps Script ضع رابط الخلفية (Web app URL) داخل علامتي الاقتباس.
window.PORTAL = {
  API_URL: '',            // مثال: 'https://script.google.com/macros/s/AKfycbwXrnYvmHHiNZHoz4-eXNlKPvJpIezbl_QnMQfYl-8DidHP7VXVxlYWsBrFHWF6HXxe2A/exec'
  MAX_UPLOAD_MB: 15,      // أقصى حجم للرفع من الموقع (الأكبر يُرفع مباشرة في Drive)
  DRIVE_API_KEY: '',      // اختياري: مفتاح Google API لإرسال الملفات الكبيرة مباشرة (انظر README)
  MAX_DIRECT_MB: 100      // أقصى حجم لملف يُرسل كمرفق (يعمل مع DRIVE_API_KEY؛ بدونه الحد 10)
};
