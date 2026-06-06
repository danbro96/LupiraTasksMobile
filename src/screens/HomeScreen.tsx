import { StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lupira Tasks</Text>
      <Text style={styles.subtitle}>Skeleton ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6e7686',
  },
});
