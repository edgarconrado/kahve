import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { session, employee, loading } = useAuth();

  if (loading || (session && !employee)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return session ? <Redirect href="/(app)/queue" /> : <Redirect href="/login" />;
}
