import { Image, StyleSheet, View } from 'react-native';

export default function HeaderLogo() {
  return (
    <View style={styles.frame} accessibilityLabel="Kahve">
      <Image source={require('../assets/icon.png')} style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(250, 236, 231, 0.35)',
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
});
