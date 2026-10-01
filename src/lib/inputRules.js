export const MAX_EXPENSE_AMOUNT=1_000_000_000;
export const graphemes=value=>Array.from(new Intl.Segmenter('zh-TW',{granularity:'grapheme'}).segment(value),part=>part.segment);
export function nameWidth(value) {
  return graphemes(value.trim()).reduce((sum,part)=>sum+(/[\p{Script=Han}\u20e3\ufe0f\p{Extended_Pictographic}\p{Regional_Indicator}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(part)?2:1),0);
}
export function nameError(value) {
  if(/[\u0000-\u001f\u007f-\u009f]/u.test(value))return '名稱不可包含換行或控制字元';
  if(!value.trim())return '請輸入名稱';
  return nameWidth(value)>14?'名稱太長了，請縮短一些':'';
}
export function assertName(value) {const error=nameError(value);if(error)throw new Error(error);return value.trim();}
export function amountInputAllowed(value) {return value===''||(/^\d+$/.test(value)&&Number(value)<=MAX_EXPENSE_AMOUNT);}
