import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';

export default function HeaderUser() {
  const { employee } = useAuth();
  const firstName = employee?.full_name.trim().split(/\s+/)[0] || 'Usuario';

  return (
    <View style={styles.container} accessibilityLabel={`Usuario: ${firstName}`}>
      <Ionicons name="person-circle-outline" size={20} color="#F5C4B3" />
      <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flex: 1,
    color: '#FAECE7',
    fontSize: 12,
    fontWeight: '600',
  },
});
