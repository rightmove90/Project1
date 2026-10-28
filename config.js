
/**
 * إعدادات الواجهة الأمامية
 * ضع رابط Google Apps Script Web App بعد نشره.
 */
window.PORTAL = {
  // رابط الخلفية (Apps Script Web App URL)
  API_URL: 'https://script.google.com/macros/s/AKfycbwXrnYvmHHiNZHoz4-eXNlKPvJpIezbl_QnMQfYl-8DidHP7VXVxlYWsBrFHWF6HXxe2A/exec',

  // أقصى حجم للملف المرفوع من الموقع بالميغابايت
  MAX_UPLOAD_MB: 15,

  // مفتاح Google API اختياري للملفات الكبيرة
  DRIVE_API_KEY: '',

  // أقصى حجم للمرفقات المباشرة بالميغابايت
  // يتطلب DRIVE_API_KEY، وإلا فالحد المذكور في التعليق هو 10 ميغابايت
  MAX_DIRECT_MB: 100
};
