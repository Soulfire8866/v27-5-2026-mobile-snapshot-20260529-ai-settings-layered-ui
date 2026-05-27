/**
 * Tra cứu Hán Việt offline (4B) — không import từ ReaderView.
 */

import { pinyin } from "pinyin-pro";
import type { DictItem, PronounMapping } from "../types";

export const phraseTranslationCache = new Map<
  string,
  { vietphrase: string; hanviet: string; apiExpired?: boolean }
>();

export const SINO_VIETNAMESE_CHAR_DICT: Record<string, string> = {
  "杨": "dương", "凌": "lăng", "正": "chính", "德": "đức", "皇": "hoàng", "已": "dĩ", "an": "an", "经": "kinh", "如": "như", "果": "quả", "幼": "ấu", "娘": "nương", "刘": "lưu", "瑾": "cẩn", "心": "tâm", "朝": "triều", "廷": "đình", "成": "thành", "绮": "khởi", "韵": "vận", "公": "công", "主": "chủ", "今": "kim", "建": "kiến", "帝": "đế", "赵": "triệu", "钱": "tiền", "李": "lý", "周": "chu", "吴": "ngô", "郑": "trịnh", "冯": "phùng", "陈": "trần", "卫": "vệ", "蒋": "tưởng", "沈": "trầm", "韩": "hàn", "朱": "chu", "尤": "vưu", "phục": "phục", "许": "hứa", "吕": "lã", "施": "thi", "张": "trương", "孔": "khổng", "曹": "tào", "严": "nghiêm", "华": "hoa", "魏": "ngụy", "陶": "đào", "thích": "thích", "谢": "tạ", "trâu": "trâu", "喻": "dụ", "bách": "bách", "đậu": "đậu", "chương": "chương", "tô": "tô", "潘": "phan", "cát": "cát", "hề": "hề", "phạm": "phạm", "bành": "bành", "鲁": "lỗ", "vi": "vi", "xương": "xương", "mã": "mã", "miêu": "miêu", "phương": "phương", "du": "du", "nhậm": "nhậm", "viên": "viên", "liễu": "liễu", "phong": "phong", "bào": "bào", "sử": "sử", "phí": "phí", "liêm": "liêm", "sầm": "sầm", "tiết": "tiết", "hạ": "hạ",
  "的": "đích", "之": "chi", "内": "nội", "外": "ngoại", "里": "lý", "中": "trung",
  "年": "niên", "月": "nguyệt", "日": "nhật", "时": "thì", "分": "phân", "秒": "giây",
  "一": "nhất", "二": "nhị", "三": "tam", "四": "tứ", "五": "ngũ", "六": "lục", "七": "thất", "八": "bát", "九": "cửu", "十": "thập", "百": "bách", "千": "thiên", "万": "vạn", "亿": "ức",
  "随": "tùy", "着": "trước", "声": "thanh", "音": "âm", "小": "tiểu", "伙": "hỏa", "子": "tử", "从": "tòng", "奈": "nại", "何": "hà", "桥": "kiều",
  "我": "ta", "你": "ngươi", "您": "ngài", "他": "hắn", "她": "nàng", "它们": "nó", "它": "nó", "们": "môn",
  "谁": "thùy", "料": "liệu", "竟": "cánh", "然": "nhiên", "死": "tử", "亡": "vong", "回": "hồi", "来": "lai", "去": "khứ", "转": "chuyển", "世": "thế", "次": "thứ",
  "没": "một", "有": "hữu", "超": "siêu", "是": "thị", "不": "bất", "在": "tại", "个": "cá", "很": "ngận", "帅": "soái", "气": "khí",
  "Mạnh": "mạnh", "婆": "bà", "汤": "thang", "贾": "giả", "珩": "hành", "恒": "hằng", "林": "lâm", "临": "lâm", "峰": "phong", "枫": "phong", "萧": "tiêu", "消": "tiêu", "焦": "tiêu", "炎": "viêm",
  "唐": "đường", "堂": "đường", "武": "vũ", "舞": "vũ", "雨": "vũ", "羽": "vũ", "宇": "vũ", "hồn": "hồn", "giới": "giới", "Tần": "tần", "Khí": "khí", "Đan": "đan", "Dược": "dược",
  "Sư": "sư", "Tôn": "tôn", "Lão": "lão", "Nhân": "nhân", "Ma": "ma", "Long": "long", "Phượng": "phượng", "Thần": "thần", "Kiếm": "kiếm", "Đao": "đao", "Thương": "thương", "Pháp": "pháp",
};

export const HEURISTIC_DICT: Record<string, string> = {
  "孟": "manh", "婆": "ba", "奈": "nai", "何": "ha", "汤": "thang", "桥": "cau",
  "贾": "gia", "珩": "hang", "恒": "hang", "林": "lam", "临": "lam", "风": "phong",
  "峰": "phong", "枫": "phong", "萧": "tieu", "消": "tieu", "焦": "tieu", "炎": "viem",
  "唐": "duong", "堂": "duong", "三": "tam", "武": "vu", "舞": "vu", "雨": "vu",
  "羽": "vu", "宇": "vu", "魂": "hon", "神": "than", "臣": "than", "界": "gioi",
  "秦": "tan", "王": "vuong", "器": "khi", "气": "khi", "丹": "dan", "药": "duoc",
  "师": "su", "尊": "ton", "孙": "ton", "帝": "de", "老": "lao", "人": "nhan",
  "魔": "ma", "long": "long", "龙": "long", "凤": "phuong", "虎": "ho", "玄": "huyen", "天": "thien",
  "地": "dia", "日": "nhat", "月": "nguyet", "星": "tinh", "水": "thuy",
  "火": "hoa", "土": "tho", "木": "moc", "金": "kim", "剑": "kiem", "刀": "dao",
  "枪": "thuong", "弓": "cung", "法": "phap", "阵": "tran", "符": "phu", "掌": "chuong",
  "拳": "quyen", "指": "chi", "劫": "kiep", "宗": "tong", "门": "mon", "派": "phai",
  "谷": "coc", "山": "son", "海": "hai", "giang": "giang", "江": "giang", "湖": "ho",
  "丘": "khau", "lăng": "lang", "mộ": "mo", "mục": "muc", "tháp": "thap", "cung": "cung",
  "điện": "dien", "lâu": "lau", "lầu": "lau", "các": "cac", "phủ": "phu", "huyện": "huyen",
  "thành": "thanh", "trấn": "tran", "thôn": "thon", "quốc": "quoc", "nhất": "nhat",
  "nhị": "nhi", "khấu": "khau", "khương": "khuong", "Cát": "cat", "gi": "cat",
  "Tuấn": "tuan", "Hầu": "hau", "Nam": "nam", "tây": "tay", "đông": "dong", "bắc": "bac",
  "trung": "trung", "Hồng": "hong", "vân": "van", "tuyết": "tuyet", "băng": "bang",
  "lôi": "loi", "Tử": "tu", "bạch": "bach", "hắc": "hac", "thanh": "thanh", "lam": "lam",
  "diệp": "diep",
};

export const PINYIN_TO_HANVIET_MAP: Record<string, string> = {
  "a": "a", "ai": "ái", "an": "an", "ang": "ang", "ao": "ao",
  "ba": "bát", "bai": "bách", "ban": "bản", "bang": "bang", "bao": "bảo", "bei": "bối", "ben": "bản", "beng": "băng", "bi": "bí", "bian": "biến", "biao": "biểu", "bie": "biệt", "bin": "tần", "bing": "binh", "bo": "bác", "bu": "bất",
  "ca": "ca", "cai": "tài", "can": "tham", "cang": "thương", "cao": "cao", "ce": "sách", "cen": "sầm", "ceng": "tằng", "cha": "tra", "chai": "sài", "chan": "sản", "chang": "trường", "chao": "siêu", "che": "xa", "chen": "thần", "cheng": "thành", "chi": "trì", "chong": "trọng", "chou": "thù", "chu": "xuất", "chua": "sỏa", "chuai": "súc", "chuan": "truyền", "chuang": "sáng", "chui": "chùy", "chun": "xuân", "chuo": "xước", "ci": "thứ", "cong": "tòng", "cou": "thấu", "cu": "thốc", "cuan": "toán", "cui": "túy", "cun": "thôn", "cuo": "thác",
  "da": "đại", "dai": "đại", "dan": "đan", "dang": "đương", "dao": "đao", "de": "đích", "dei": "đắc", "dem": "đẫm", "den": "đơn", "deng": "đăng", "di": "địa", "dian": "điện", "diao": "điêu", "die": "điệp", "ding": "đỉnh", "diu": "diêu", "dong": "đông", "dou": "đấu", "du": "độc", "duan": "đoản", "dui": "đối", "dun": "độn", "duo": "đoạt",
  "e": "ách", "ei": "ây", "en": "ân", "eng": "ưng", "er": "nhị",
  "fa": "pháp", "fan": "phàm", "fang": "phương", "fei": "phi", "fen": "phân", "feng": "phong", "fo": "phật", "fou": "phủ", "fu": "phủ",
  "ga": "các", "gai": "cái", "gan": "can", "gang": "cương", "gao": "cao", "ge": "các", "gei": "cấp", "gen": "căn", "geng": "canh", "gong": "công", "gou": "cẩu", "gu": "cốc", "gua": "quả", "guai": "quái", "guan": "quan", "guang": "quang", "gui": "quỷ", "gun": "cổn", "guo": "quốc",
  "ha": "hà", "hai": "hải", "han": "hán", "hang": "hãng", "hao": "hảo", "he": "hà", "hei": "hắc", "hen": "ngận", "heng": "hằng", "hong": "hồng", "hou": "hầu", "hu": "hổ", "hua": "hỏa", "huai": "hoài", "huan": "hoan", "huang": "hoàng", "hui": "hồi", "hun": "hồn", "huo": "hỏa",
  "ji": "kỷ", "jia": "giả", "jian": "kiếm", "jiang": "giang", "jiao": "giao", "jie": "kiếp", "jin": "kim", "jing": "cánh", "jiong": "quẫn", "jiu": "cửu", "ju": "cự", "juan": "quyển", "jue": "giác", "jun": "quân",
  "ka": "kháp", "kai": "khai", "kan": "khán", "kang": "khang", "kao": "khảo", "ke": "khắc", "kei": "khắc", "ken": "khẩn", "keng": "khanh", "kong": "không", "kou": "khấu", "ku": "khổ", "kua": "khóa", "kuai": "khoái", "kuan": "khoan", "kuang": "khuông", "kui": "khuê", "kun": "khôn", "kuo": "khuếch",
  "la": "lạp", "lai": "lai", "lan": "lam", "lang": "lăng", "lao": "lão", "le": "lạc", "lei": "lôi", "leng": "lãnh", "li": "ly", "lia": "lưỡng", "lian": "liên", "liang": "lưỡng", "liao": "liệu", "lie": "liệt", "lin": "lâm", "ling": "lăng", "liu": "lục", "lo": "la", "long": "long", "lou": "lầu", "lu": "lục", "luan": "loạn", "lue": "lược", "lun": "luân", "luo": "la", "lv": "lữ",
  "ma": "ma", "mai": "mại", "man": "mạn", "mang": "mang", "mao": "mao", "me": "ma", "mei": "mỹ", "men": "môn", "meng": "mạnh", "mi": "mịch", "mian": "diện", "miao": "miêu", "mie": "diệt", "min": "mẫn", "ming": "minh", "miu": "mâu", "mo": "ma", "mou": "mưu", "mu": "mộc",
  "na": "nại", "nai": "nại", "nan": "nam", "nang": "nang", "nao": "náo", "ne": "nột", "nei": "nội", "nen": "nộn", "neng": "năng", "ni": "nhĩ", "nian": "niên", "niang": "nương", "niao": "điểu", "nie": "niết", "nin": "ngài", "ning": "ninh", "niu": "ngưu", "nong": "nông", "nou": "nậu", "nu": "nô", "nuan": "noãn", "nue": "ngược", "nuo": "nặc", "nv": "nữ",
  "o": "ô", "ou": "âu",
  "pa": "bá", "pai": "phái", "pan": "phán", "pang": "bàng", "pao": "bào", "pei": "bối", "pen": "bồn", "peng": "bành", "pi": "tì", "pian": "phiến", "piao": "phiêu", "pie": "phiết", "pin": "tần", "ping": "bình", "po": "bà", "pou": "phẫu", "pu": "bộc",
  "qi": "thất", "qia": "kháp", "qian": "thiên", "qiang": "thương", "qiao": "kiều", "qie": "thiết", "qin": "tần", "qing": "thanh", "qiong": "quỳnh", "qiu": "cầu", "qu": "khứ", "quan": "quyền", "que": "khuyết", "qun": "quần",
  "ran": "nhiên", "rang": "nhương", "rao": "nhiêu", "re": "nhiệt", "ren": "nhân", "reng": "nhưng", "ri": "nhật", "rong": "dung", "rou": "nhu", "ru": "nho", "ruan": "nhuyễn", "rui": "nhuệ", "run": "nhuận", "ruo": "nhược",
  "sa": "tạt", "sai": "tái", "san": "tam", "sang": "tang", "sao": "tao", "se": "sắc", "sen": "sâm", "seng": "tằng", "sha": "sa", "shai": "sái", "shan": "sơn", "shang": "thượng", "shao": "thiếu", "she": "xã", "shen": "thần", "sheng": "thanh", "shi": "thị", "shou": "thủ", "shu": "thư", "shua": "sái", "shuai": "soái", "shuan": "soan", "shuang": "song", "shui": "thủy", "shun": "thuận", "shuo": "thuyết", "si": "tứ", "song": "tống", "sou": "tẩy", "su": "sư", "suan": "toán", "sui": "tùy", "sun": "tôn", "suo": "sở",
  "ta": "tha", "tai": "thái", "tan": "tần", "tang": "đường", "tao": "đào", "te": "đặc", "teng": "đằng", "ti": "ti", "tian": "thiên", "tiao": "điều", "tie": "thiết", "ting": "thính", "tong": "tông", "tou": "đầu", "tu": "thổ", "tuan": "đoàn", "tui": "thối", "tun": "thôn", "tuo": "thoát",
  "wa": "oa", "wai": "ngoại", "wan": "vạn", "wang": "vương", "wei": "vi", "wen": "văn", "weng": "ông", "wo": "ngã", "wu": "ngũ",
  "xi": "tây", "xia": "hạ", "xian": "hiện", "xiang": "hương", "xiao": "tiểu", "xie": "tà", "xin": "tân", "xing": "tinh", "xiong": "hùng", "xiu": "tu", "xu": "hư", "xuan": "huyền", "xue": "tuyết", "xun": "tuần",
  "ya": "á", "yan": "viêm", "yang": "dương", "yao": "yêu", "ye": "diệp", "yi": "y", "yin": "âm", "ying": "anh", "yo": "dục", "yong": "dũng", "you": "hữu", "yu": "vũ", "yuan": "viên", "yue": "nguyệt", "yun": "vân",
  "za": "tạp", "zai": "tại", "zan": "tán", "zang": "tạng", "zao": "tảo", "ze": "trạch", "zei": "tặc", "zen": "trẫm", "zeng": "tăng", "zha": "trát", "zhai": "trạch", "zhan": "chiến", "zhang": "chưởng", "zhao": "chiêu", "zhe": "trước", "zhen": "trận", "zheng": "chính", "zhi": "chi", "zhong": "trung", "zhou": "châu", "zhu": "chu", "zhua": "trảo", "zhuai": "chuế", "zhuan": "chuyển", "zhuang": "tráng", "zhui": "truy", "zhun": "chuẩn", "zhuo": "trác", "zi": "tử", "zong": "tông", "zou": "tẩu", "zu": "tổ", "zuan": "toản", "zui": "tối", "zun": "tôn", "zuo": "tác",
};

function capitalizeHanVietSyllable(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Đọc một chữ Hán (dùng khi căn chỉnh đoạn chọn). */
export function getCharHanVietReading(char: string): string {
  const c = char.trim();
  if (!c) return "";
  const exact = SINO_VIETNAMESE_CHAR_DICT[c];
  if (exact) return exact;
  const heuristic = HEURISTIC_DICT[c];
  if (heuristic) return heuristic;
  try {
    const py = pinyin(c, { toneType: "none" })?.toLowerCase() || "";
    if (py && PINYIN_TO_HANVIET_MAP[py]) return PINYIN_TO_HANVIET_MAP[py];
    return py;
  } catch {
    return c;
  }
}

function charToHanViet(
  c: string,
  dictItems: DictItem[],
  pronounMappings: PronounMapping[]
): string {
  const exactHVMatch = SINO_VIETNAMESE_CHAR_DICT[c];
  if (exactHVMatch) {
    return capitalizeHanVietSyllable(exactHVMatch);
  }

  const heuristic = HEURISTIC_DICT[c];
  if (heuristic) {
    let cleaned = heuristic;
    if (cleaned === "son") cleaned = "sơn";
    else if (cleaned === "tieu") cleaned = "tiểu";
    else if (cleaned === "ba" && c === "婆") cleaned = "bà";
    else if (cleaned === "cau" && c === "桥") cleaned = "kiều";
    else if (cleaned === "lao" && c === "老") cleaned = "lão";
    else if (cleaned === "nhan" && c === "人") cleaned = "nhân";
    else if (cleaned === "thuy" && c === "水") cleaned = "thủy";
    else if (cleaned === "hoa" && c === "火") cleaned = "hỏa";
    else if (cleaned === "tho" && c === "土") cleaned = "thổ";
    else if (cleaned === "moc" && c === "木") cleaned = "mộc";
    else if (cleaned === "kim" && c === "金") cleaned = "kim";
    else if (cleaned === "kiem" && c === "剑") cleaned = "kiếm";
    else if (cleaned === "dao" && c === "刀") cleaned = "đao";
    else if (cleaned === "dan" && c === "丹") cleaned = "đan";
    else if (cleaned === "duoc" && c === "药") cleaned = "dược";
    else if (cleaned === "su" && c === "师") cleaned = "sư";
    else if (cleaned === "ton" && c === "尊") cleaned = "tôn";
    else if (cleaned === "de" && c === "帝") cleaned = "đế";
    else if (cleaned === "tan" && c === "秦") cleaned = "tần";
    else if (cleaned === "vuong" && c === "王") cleaned = "vương";
    else if (cleaned === "tuong" && c === "将") cleaned = "tướng";
    return capitalizeHanVietSyllable(cleaned);
  }

  const singleDict = dictItems.find((item) => item.chinese === c);
  if (singleDict?.vietnamese) {
    return capitalizeHanVietSyllable(singleDict.vietnamese);
  }

  try {
    const charPy = pinyin(c, { toneType: "none" }) || "";
    if (charPy) {
      let hv = charPy.toLowerCase();
      let matched = false;

      if (hv === "wo") { hv = "ngã"; matched = true; }
      else if (hv === "ni") { hv = "nhĩ"; matched = true; }
      else if (hv === "ta") { hv = "tha"; matched = true; }
      else if (hv === "men") { hv = "môn"; matched = true; }
      else if (hv === "de") { hv = "đích"; matched = true; }
      else if (hv === "shi") {
        if (c === "是") hv = "thị";
        else if (c === "师" || c === "師") hv = "sư";
        else hv = "thị";
        matched = true;
      }
      else if (hv === "yi") { hv = "nhất"; matched = true; }
      else if (hv === "er") { hv = "nhị"; matched = true; }
      else if (hv === "san") { hv = "tam"; matched = true; }
      else if (hv === "si") { hv = "tứ"; matched = true; }
      else if (hv === "wu") { hv = "ngũ"; matched = true; }
      else if (hv === "liu") { hv = "lục"; matched = true; }
      else if (hv === "qi") { hv = "thất"; matched = true; }
      else if (hv === "ba") {
        if (c === "八") hv = "bát";
        else hv = "ba";
        matched = true;
      }
      else if (hv === "jiu") { hv = "cửu"; matched = true; }
      else if (hv === "bu") { hv = "bất"; matched = true; }
      else if (hv === "zai") { hv = "tại"; matched = true; }
      else if (hv === "you") { hv = "hữu"; matched = true; }
      else if (hv === "me") { hv = "ma"; matched = true; }
      else if (hv === "sheng") { hv = "thanh"; matched = true; }
      else if (hv === "yin") { hv = "âm"; matched = true; }
      else if (hv === "sui") { hv = "tùy"; matched = true; }
      else if (hv === "zhe") { hv = "trước"; matched = true; }
      else if (hv === "ge") { hv = "cá"; matched = true; }
      else if (hv === "hen") { hv = "ngận"; matched = true; }
      else if (hv === "shuai") { hv = "soái"; matched = true; }
      else if (hv === "qi") {
        if (c === "气" || c === "氣") hv = "khí";
        else hv = "kỳ";
        matched = true;
      }
      else if (hv === "xiao") { hv = "tiểu"; matched = true; }
      else if (hv === "huo") { hv = "hỏa"; matched = true; }
      else if (hv === "zi") { hv = "tử"; matched = true; }
      else if (hv === "cong") { hv = "tòng"; matched = true; }
      else if (hv === "nai") { hv = "nại"; matched = true; }
      else if (hv === "he") {
        hv = c === "河" ? "hà" : "hà";
        matched = true;
      }
      else if (hv === "qiao") { hv = "kiều"; matched = true; }
      else if (hv === "dui") { hv = "đối"; matched = true; }
      else if (hv === "mian") { hv = "diện"; matched = true; }
      else if (hv === "chu") {
        if (c === "楚") hv = "sở";
        else if (c === "朱") hv = "chu";
        else if (c === "周") hv = "chu";
        else hv = "xuất";
        matched = true;
      }
      else if (hv === "huan") {
        if (c === "欢" || c === "歡") hv = "hoan";
        else hv = "hoan";
        matched = true;
      }
      else if (hv === "ke") {
        if (c === "可") hv = "khả";
        else hv = "khả";
        matched = true;
      }
      else if (hv === "qing") {
        if (c === "卿") hv = "khanh";
        else hv = "khanh";
        matched = true;
      }
      else if (hv === "lin") {
        if (c === "琳" || c === "霖") hv = "lâm";
        else if (c === "琅" || c === "瑯") hv = "lang";
        else hv = "lâm";
        matched = true;
      }
      else if (hv === "lang") {
        if (c === "琅" || c === "瑯") hv = "lang";
        else hv = "lang";
        matched = true;
      }
      else if (hv === "lan") {
        if (c === "缆" || c === "盤") hv = "lãm";
        else if (c === "兰" || c === "蘭") hv = "lan";
        else hv = "lam";
        matched = true;
      }

      if (!matched && PINYIN_TO_HANVIET_MAP[hv]) {
        hv = PINYIN_TO_HANVIET_MAP[hv];
      }

      return capitalizeHanVietSyllable(hv);
    }
  } catch {
    // ignore
  }

  return c;
}

export function getHanVietOffline(
  chinese: string,
  _vietnamese: string,
  dictItems: DictItem[],
  pronounMappings: PronounMapping[],
): string {
  if (!chinese) return "";
  const trimmedZh = chinese.trim();
  if (!trimmedZh || trimmedZh === "Đang tra cứu...") return "";

  if (phraseTranslationCache.has(trimmedZh)) {
    const cached = phraseTranslationCache.get(trimmedZh)!;
    if (cached.hanviet) return cached.hanviet;
  }

  const pmMatch = pronounMappings.find((pm) => pm.chinese === trimmedZh);
  if (pmMatch) {
    if (pmMatch.pinyin) return pmMatch.pinyin;
    if (pmMatch.vietnamese) return pmMatch.vietnamese;
  }

  const dictMatch = dictItems.find((item) => item.chinese === trimmedZh);
  if (dictMatch?.vietnamese) {
    return dictMatch.vietnamese;
  }

  const chars = Array.from(trimmedZh);
  const resultWords = chars.map((c) => charToHanViet(c, dictItems, pronounMappings));
  return resultWords.join(" ");
}
