import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Section { heading: string; body: string[] }

interface Props {
  title: string;
  updated: string;
  intro?: string;
  sections: Section[];
}

export default function LegalDocument({ title, updated, intro, sections }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#4A1B0C" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Última actualización: {updated}</Text>
        {intro && <Text style={styles.paragraph}>{intro}</Text>}
        {sections.map((s) => (
          <View key={s.heading} style={{ marginTop: 22 }}>
            <Text style={styles.heading}>☕ {s.heading}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.paragraph}>{p}</Text>
            ))}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#222' },
  content: { padding: 20 },
  updated: {
    fontSize: 12, color: '#999', marginBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 14,
  },
  heading: { fontSize: 15, fontWeight: '700', color: '#4A1B0C', marginBottom: 8 },
  paragraph: { fontSize: 13.5, color: '#333', lineHeight: 21, marginBottom: 8 },
});
