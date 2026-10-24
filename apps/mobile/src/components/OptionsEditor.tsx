import { Pressable, Text, TextInput, View } from "react-native";
import { cleanOptions, combinations, rowKey, rowOf, variantLabel, type OptionDraft, type OptionsDraft, type RowDraft, type WeightUnit } from "@yanabuy/shared";
import { Field } from "@/components/ui";
import { colors, font } from "@/lib/theme";

/** Colour / size / MOQ choices on the seller's product form, with a price and stock for each combination. */

const PLACEHOLDER = [
  ["Colour", "Red, Blue, Black"],
  ["Size", "S, M, L, XL"],
  ["Material", "Cotton, Silk"],
];

function Small({
  label,
  value,
  onChange,
  disabled,
  numeric,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  numeric?: "decimal" | "whole";
  placeholder?: string;
}) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 11.5, color: colors.muted }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType={numeric === "whole" ? "number-pad" : "decimal-pad"}
        placeholderTextColor="#9A91A3"
        placeholder={placeholder ?? (label.startsWith("Stock") ? "—" : "")}
        style={{ height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "#fff", paddingHorizontal: 10, fontFamily: font.regular, fontSize: 14, color: colors.ink }}
      />
    </View>
  );
}

export function OptionsEditor({
  value,
  onChange,
  error,
  weightUnit = "kg",
}: {
  value: OptionsDraft;
  onChange: (d: OptionsDraft) => void;
  error?: string;
  /** Each combination's weight is typed in this unit. */
  weightUnit?: WeightUnit;
}) {
  const options = cleanOptions(value);
  const combos = options.length && options.every((o) => o.name && o.values.length) ? combinations(options) : [];
  const setOption = (i: number, patch: Partial<OptionDraft>) => onChange({ ...value, options: value.options.map((o, n) => (n === i ? { ...o, ...patch } : o)) });
  const setRow = (values: string[], patch: Partial<RowDraft>) => {
    onChange({ ...value, rows: { ...value.rows, [rowKey(values)]: { ...rowOf(value, values), ...patch } } });
  };
  const samePrice = () => {
    const first = combos.map((c) => rowOf(value, c).price).find((v) => v && v.trim());
    if (!first) return;
    const rows = { ...value.rows };
    for (const c of combos) {
      const cur = rowOf(value, c);
      if (cur.on) rows[rowKey(c)] = { ...cur, price: first };
    }
    onChange({ ...value, rows });
  };

  return (
    <View style={{ gap: 10, backgroundColor: colors.ground, borderRadius: 14, padding: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 14, color: colors.ink }}>Options (optional)</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: colors.muted }}>For colours, sizes or minimum order quantity. Each combination gets its own price, stock and (if it differs) weight.</Text>
      </View>
      {value.options.map((o, i) => (
        <View key={i} style={{ gap: 8, backgroundColor: "#fff", borderRadius: 12, padding: 10 }}>
          <Field label={`Option ${i + 1}`} value={o.name} onChangeText={(t) => setOption(i, { name: t })} placeholder={PLACEHOLDER[i][0]} maxLength={40} />
          <Field label="Choices, separated by commas" value={o.values} onChangeText={(t) => setOption(i, { values: t })} placeholder={PLACEHOLDER[i][1]} />
          <Pressable accessibilityRole="button" onPress={() => onChange({ ...value, options: value.options.filter((_, n) => n !== i) })} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.danger }}>Remove this option</Text>
          </Pressable>
        </View>
      ))}
      {value.options.length < 3 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange({ ...value, options: [...value.options, { name: "", values: "" }] })}
          style={{ alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderStyle: "dashed", borderColor: colors.purple, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>+ Add {value.options.length ? "another option" : "an option (colour, size…)"}</Text>
        </Pressable>
      )}

      {combos.length > 0 && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.textSoft }}>{combos.length} combinations</Text>
            <Pressable accessibilityRole="button" onPress={samePrice}>
              <Text style={{ fontFamily: font.bold, fontSize: 13, color: colors.purple }}>Same price for all</Text>
            </Pressable>
          </View>
          {combos.map((c) => {
            const r = rowOf(value, c);
            const label = variantLabel(c);
            return (
              <View key={rowKey(c)} style={{ gap: 8, backgroundColor: "#fff", borderRadius: 12, padding: 10, opacity: r.on ? 1 : 0.55 }}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: r.on }} accessibilityLabel={`Sell ${label}`} onPress={() => setRow(c, { on: !r.on })} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: r.on ? colors.purple : colors.lineStrong, backgroundColor: r.on ? colors.purple : "#fff", alignItems: "center", justifyContent: "center" }}>
                    {r.on && <Text style={{ color: "#fff", fontSize: 13, fontFamily: font.bold }}>✓</Text>}
                  </View>
                  <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 14, color: colors.ink }}>{label}</Text>
                </Pressable>
                {r.on && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Small label="Price ($)" value={r.price} onChange={(v) => setRow(c, { price: v })} />
                    <Small label="Old price" value={r.compareAtPrice} onChange={(v) => setRow(c, { compareAtPrice: v })} />
                    <Small label="Stock" value={r.stock} onChange={(v) => setRow(c, { stock: v })} numeric="whole" />
                  </View>
                )}
                {r.on && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Small label={`Weight (${weightUnit})`} value={r.weight ?? ""} onChange={(v) => setRow(c, { weight: v })} placeholder="Same as product" />
                    <View style={{ flex: 2 }} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      {combos.length > 100 && <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>That's {combos.length} combinations — the most is 100.</Text>}
      {error ? <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}
