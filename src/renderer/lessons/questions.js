// Bộ câu hỏi Vật lý dùng khi hái trái cây (Bài 01 · Khu vườn trên mây).
// File này dùng chung cho app (window.PhysicsQuestions) và cho script tạo giọng đọc
// (scripts/generate-voice.js). Sau khi sửa/thêm câu hỏi, chạy: npm run voice
//
// Mỗi câu: id (tên file âm thanh, không dấu), text (chữ hiển thị), answers, correct (chỉ số
// đáp án đúng), explain (giải thích). Các trường say* là cách ĐỌC khi chữ hiển thị có kí hiệu
// (v = s / t, m/s…) mà giọng đọc sẽ đọc sai; nếu bỏ trống thì đọc đúng như chữ hiển thị.
(() => {
  const QUESTIONS = [
    {
      id: 'mat-troi-moc', text: 'Mặt Trời mọc ở hướng nào?',
      answers: ['Hướng Đông', 'Hướng Tây', 'Hướng Nam'], correct: 0,
      explain: 'Mặt Trời mọc ở hướng Đông.'
    },
    {
      id: 'quang-duong-cung-huong', text: 'Đi 3 m về Đông rồi đi tiếp 2 m về Đông. Quãng đường là bao nhiêu?',
      sayText: 'Đi 3 mét về hướng Đông, rồi đi tiếp 2 mét về hướng Đông. Quãng đường là bao nhiêu?',
      answers: ['1 m', '5 m', '6 m'], sayAnswers: ['1 mét', '5 mét', '6 mét'], correct: 1,
      explain: 'Quãng đường bằng 3 + 2 = 5 m.', sayExplain: 'Quãng đường bằng 3 cộng 2, bằng 5 mét.'
    },
    {
      id: 'dich-chuyen-ve-cho-cu', text: 'Đi 4 m về Đông rồi 4 m về Tây. Độ dịch chuyển bằng bao nhiêu?',
      sayText: 'Đi 4 mét về hướng Đông, rồi 4 mét về hướng Tây. Độ dịch chuyển bằng bao nhiêu?',
      answers: ['4 m', '8 m', '0 m'], sayAnswers: ['4 mét', '8 mét', '0 mét'], correct: 2,
      explain: 'Vị trí cuối trùng vị trí đầu nên độ dịch chuyển bằng 0 m.',
      sayExplain: 'Vị trí cuối trùng vị trí đầu, nên độ dịch chuyển bằng 0 mét.'
    },
    {
      id: 'cong-thuc-toc-do', text: 'Công thức tính tốc độ là gì?',
      answers: ['v = s / t', 'v = s × t', 'v = t / s'],
      sayAnswers: ['vê bằng ét chia tê', 'vê bằng ét nhân tê', 'vê bằng tê chia ét'], correct: 0,
      explain: 'Tốc độ bằng quãng đường chia cho thời gian.',
      sayExplain: 'Tốc độ bằng quãng đường chia cho thời gian: vê bằng ét chia tê.'
    },
    {
      id: 'don-vi-toc-do', text: 'Đơn vị tốc độ trong hệ SI là gì?',
      sayText: 'Đơn vị tốc độ trong hệ ét i là gì?',
      answers: ['m', 'm/s', 's'], sayAnswers: ['mét', 'mét trên giây', 'giây'], correct: 1,
      explain: 'Đơn vị tốc độ trong hệ SI là mét trên giây.',
      sayExplain: 'Đơn vị tốc độ trong hệ ét i là mét trên giây.'
    },
    {
      id: 'dinh-nghia-quang-duong', text: 'Đại lượng nào cho biết toàn bộ độ dài đường đã đi?',
      answers: ['Độ dịch chuyển', 'Thời gian', 'Quãng đường'], correct: 2,
      explain: 'Quãng đường là toàn bộ độ dài đường vật đã đi.'
    },
    {
      id: 'huong-doi-dien-bac', text: 'Hướng nào đối diện với hướng Bắc?',
      answers: ['Hướng Đông', 'Hướng Nam', 'Hướng Tây'], correct: 1,
      explain: 'Hướng Nam đối diện với hướng Bắc.'
    },
    {
      id: 'tinh-toc-do', text: 'Đi được 10 m trong 2 giây thì tốc độ là bao nhiêu?',
      sayText: 'Đi được 10 mét trong 2 giây thì tốc độ là bao nhiêu?',
      answers: ['8 m/s', '20 m/s', '5 m/s'],
      sayAnswers: ['8 mét trên giây', '20 mét trên giây', '5 mét trên giây'], correct: 2,
      explain: 'v = s / t = 10 / 2 = 5 m/s.',
      sayExplain: 'Vê bằng ét chia tê, bằng 10 chia 2, bằng 5 mét trên giây.'
    },
    {
      id: 'ki-hieu-do-dich-chuyen', text: 'Kí hiệu của độ dịch chuyển là gì?',
      answers: ['d', 's', 'v'], sayAnswers: ['chữ d', 'chữ s', 'chữ v'], correct: 0,
      explain: 'Độ dịch chuyển kí hiệu là d.', sayExplain: 'Độ dịch chuyển được kí hiệu bằng chữ d.'
    },
    {
      id: 'ki-hieu-quang-duong', text: 'Kí hiệu của quãng đường là gì?',
      answers: ['t', 's', 'd'], sayAnswers: ['chữ t', 'chữ s', 'chữ d'], correct: 1,
      explain: 'Quãng đường kí hiệu là s.', sayExplain: 'Quãng đường được kí hiệu bằng chữ s.'
    }
  ];

  // Ba đoạn đọc cho mỗi câu: câu hỏi + đáp án, lời khen khi đúng, lời nhắc khi sai.
  // Tên file: assets/voice/<id>.mp3, <id>-dung.mp3, <id>-sai.mp3
  function voiceClips(question) {
    const options = question.answers
      .map((answer, index) => `${String.fromCharCode(65 + index)}: ${question.sayAnswers?.[index] || answer}.`)
      .join(' ');
    const explain = question.sayExplain || question.explain;
    return {
      [question.id]: `${question.sayText || question.text} ${options}`,
      [`${question.id}-dung`]: `Chính xác! ${explain}`,
      [`${question.id}-sai`]: `Chưa đúng. ${explain}`
    };
  }

  const api = { QUESTIONS, voiceClips };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PhysicsQuestions = api;
})();
