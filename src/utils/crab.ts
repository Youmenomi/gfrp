export default function crab(
  text: string,
  arg1: string,
  arg2: string,
  start: number = 0,
  array: string[] = []
) {
  let l = -1;
  let r = -1;
  l = text.indexOf(arg1, start);
  if (l < 0) return array;
  start = l + arg1.length;
  r = text.indexOf(arg2, start);
  if (r < 0) return array;
  array.push(text.substring(start, r));
  start = r + arg2.length;
  crab(text, arg1, arg2, start, array);
  return array;
}
